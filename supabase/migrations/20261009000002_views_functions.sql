-- =====================================================================
-- 02. Views & fungsi transaksi (atomik, dipanggil via supabase.rpc)
-- Semua fungsi SECURITY INVOKER -> tetap tunduk pada RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- VIEWS
-- ---------------------------------------------------------------------

-- Ringkasan stok per item: on hand, sedang dipesan (PO), supply WO (FG),
-- kebutuhan WO yang belum dikonsumsi (material).
create or replace view public.v_item_stock
with (security_invoker = true) as
select
  i.id, i.sku, i.name, i.item_type, i.unit, i.sale_price, i.cost_price,
  i.min_stock, i.moq, i.order_multiple, i.lead_time_days,
  i.default_supplier_id, sup.name as supplier_name,
  sup.lead_time_days as supplier_lead_time_days,
  i.is_active,
  coalesce(s.on_hand, 0)   as on_hand,
  coalesce(po.on_order, 0) as on_order,
  coalesce(wo_out.qty, 0)  as wo_supply,
  coalesce(wo_in.qty, 0)   as wo_demand,
  coalesce(s.on_hand, 0) * i.cost_price as stock_value
from public.items i
left join public.suppliers sup on sup.id = i.default_supplier_id
left join (
  select item_id, sum(qty) as on_hand
  from public.stock_movements group by item_id
) s on s.item_id = i.id
left join (
  select pl.item_id, sum(greatest(pl.qty - pl.qty_received, 0)) as on_order
  from public.po_lines pl
  join public.purchase_orders p on p.id = pl.po_id
  where p.status in ('DRAFT','ORDERED','PARTIAL')
  group by pl.item_id
) po on po.item_id = i.id
left join (
  select item_id, sum(greatest(qty_planned - qty_produced, 0)) as qty
  from public.work_orders
  where status in ('PLANNED','IN_PROGRESS')
  group by item_id
) wo_out on wo_out.item_id = i.id
left join (
  select m.item_id, sum(greatest(m.qty_required - m.qty_consumed, 0)) as qty
  from public.work_order_materials m
  join public.work_orders w on w.id = m.wo_id
  where w.status in ('PLANNED','IN_PROGRESS')
  group by m.item_id
) wo_in on wo_in.item_id = i.id;

create or replace view public.v_orders
with (security_invoker = true) as
select
  o.*,
  c.name as customer_name,
  c.code as customer_code,
  coalesce(l.total_amount, 0)  as total_amount,
  coalesce(l.total_qty, 0)     as total_qty,
  coalesce(l.delivered_qty, 0) as delivered_qty,
  coalesce(l.line_count, 0)    as line_count,
  coalesce(inv.invoiced_amount, 0) as invoiced_amount,
  coalesce(inv.invoice_count, 0)   as invoice_count,
  coalesce(wo.wo_count, 0)         as wo_count
from public.orders o
join public.customers c on c.id = o.customer_id
left join (
  select order_id,
         sum(qty * unit_price) as total_amount,
         sum(qty) as total_qty,
         sum(qty_delivered) as delivered_qty,
         count(*) as line_count
  from public.order_lines group by order_id
) l on l.order_id = o.id
left join (
  select order_id, sum(total) as invoiced_amount, count(*) as invoice_count
  from public.invoices where status <> 'VOID' and order_id is not null
  group by order_id
) inv on inv.order_id = o.id
left join (
  select order_id, count(*) as wo_count
  from public.work_orders where status <> 'CANCELLED' and order_id is not null
  group by order_id
) wo on wo.order_id = o.id;

-- Baris order yang masih terbuka (sisa belum dikirim) -> input MRP
create or replace view public.v_open_order_lines
with (security_invoker = true) as
select
  ol.id as order_line_id,
  o.id  as order_id,
  o.order_no,
  o.status,
  o.order_date,
  o.due_date,
  c.name as customer_name,
  ol.item_id,
  ol.qty,
  ol.qty_delivered,
  greatest(ol.qty - ol.qty_delivered, 0) as qty_remaining
from public.order_lines ol
join public.orders o on o.id = ol.order_id
join public.customers c on c.id = o.customer_id
where o.status in ('DRAFT','CONFIRMED','IN_PRODUCTION','PARTIAL')
  and ol.qty > ol.qty_delivered;

create or replace view public.v_invoices
with (security_invoker = true) as
select
  inv.*,
  c.name as customer_name,
  c.code as customer_code,
  o.order_no,
  inv.total - inv.amount_paid as balance,
  (inv.status in ('ISSUED','PARTIAL') and inv.due_date < current_date) as is_overdue
from public.invoices inv
join public.customers c on c.id = inv.customer_id
left join public.orders o on o.id = inv.order_id;

create or replace view public.v_purchase_orders
with (security_invoker = true) as
select p.*, s.name as supplier_name, s.code as supplier_code
from public.purchase_orders p
join public.suppliers s on s.id = p.supplier_id;

create or replace view public.v_work_orders
with (security_invoker = true) as
select
  w.*,
  i.sku as item_sku, i.name as item_name, i.unit as item_unit,
  b.code as bom_code,
  o.order_no
from public.work_orders w
join public.items i on i.id = w.item_id
join public.boms b on b.id = w.bom_id
left join public.orders o on o.id = w.order_id;

create or replace view public.v_stock_movements
with (security_invoker = true) as
select m.*, i.sku as item_sku, i.name as item_name, i.unit as item_unit, i.item_type
from public.stock_movements m
join public.items i on i.id = m.item_id;

-- ---------------------------------------------------------------------
-- HELPERS
-- ---------------------------------------------------------------------

create or replace function public.next_doc_no(p_type text, p_date date default current_date)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_period text := to_char(coalesce(p_date, current_date), 'YYYY/MM');
  v_no int;
begin
  insert into doc_sequences (doc_type, period, last_no)
  values (p_type, v_period, 1)
  on conflict (doc_type, period)
  do update set last_no = doc_sequences.last_no + 1
  returning last_no into v_no;
  return p_type || '/' || v_period || '/' || lpad(v_no::text, 4, '0');
end;
$$;

create or replace function public._on_hand(p_item_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(qty), 0) from stock_movements where item_id = p_item_id;
$$;

-- Kunci baris item lalu kembalikan pesan kekurangan (null jika cukup).
create or replace function public._shortage(p_item_id uuid, p_need numeric)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_item items%rowtype;
  v_on_hand numeric;
begin
  select * into v_item from items where id = p_item_id for update;
  v_on_hand := _on_hand(p_item_id);
  if v_on_hand < p_need then
    return format('%s %s: tersedia %s %s, dibutuhkan %s',
                  v_item.sku, v_item.name, trim_scale(v_on_hand), v_item.unit, trim_scale(p_need));
  end if;
  return null;
end;
$$;

create or replace function public._post_movement(
  p_item_id uuid, p_qty numeric, p_type text, p_date date,
  p_ref_type text, p_ref_id uuid, p_ref_no text,
  p_notes text default null, p_unit_cost numeric default null
) returns void
language plpgsql
set search_path = public
as $$
begin
  if p_qty = 0 then return; end if;
  insert into stock_movements (item_id, movement_date, movement_type, qty, unit_cost,
                               ref_type, ref_id, ref_no, notes)
  values (p_item_id, coalesce(p_date, current_date), p_type, p_qty,
          coalesce(p_unit_cost, (select cost_price from items where id = p_item_id)),
          p_ref_type, p_ref_id, p_ref_no, p_notes);
end;
$$;

-- Hitung ulang status order dari pengiriman & WO
create or replace function public._refresh_order_status(p_order_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_total numeric;
  v_delivered numeric;
  v_new text;
begin
  if p_order_id is null then return; end if;
  select status into v_status from orders where id = p_order_id;
  if v_status is null or v_status in ('DRAFT','CANCELLED') then return; end if;

  select coalesce(sum(qty), 0), coalesce(sum(qty_delivered), 0)
    into v_total, v_delivered
  from order_lines where order_id = p_order_id;

  if v_total > 0 and v_delivered >= v_total then
    v_new := 'DELIVERED';
  elsif v_delivered > 0 then
    v_new := 'PARTIAL';
  elsif exists (select 1 from work_orders
                where order_id = p_order_id and status <> 'CANCELLED') then
    v_new := 'IN_PRODUCTION';
  else
    v_new := 'CONFIRMED';
  end if;

  if v_new <> v_status then
    update orders set status = v_new where id = p_order_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- BOM
-- ---------------------------------------------------------------------
create or replace function public.save_bom(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_item items%rowtype;
  v_line jsonb;
  v_sort int := 0;
  v_is_default boolean := coalesce((p_data->>'is_default')::boolean, true);
  v_code text := nullif(trim(p_data->>'code'), '');
begin
  select * into v_item from items where id = (p_data->>'item_id')::uuid;
  if not found then raise exception 'Produk (FG) tidak ditemukan'; end if;
  if v_item.item_type <> 'FG' then
    raise exception 'BOM hanya bisa dibuat untuk barang jadi (FG)';
  end if;
  if jsonb_array_length(coalesce(p_data->'lines', '[]'::jsonb)) = 0 then
    raise exception 'BOM harus memiliki minimal 1 material';
  end if;

  if v_code is null then
    v_code := 'BOM-' || v_item.sku || '-' ||
              (select count(*) + 1 from boms where item_id = v_item.id);
  end if;

  if v_is_default then
    update boms set is_default = false
    where item_id = v_item.id and is_default and id is distinct from v_id;
  end if;

  if v_id is null then
    insert into boms (item_id, code, name, output_qty, is_default, is_active, notes)
    values (v_item.id, v_code, nullif(p_data->>'name', ''),
            coalesce((p_data->>'output_qty')::numeric, 1), v_is_default,
            coalesce((p_data->>'is_active')::boolean, true), nullif(p_data->>'notes', ''))
    returning id into v_id;
  else
    update boms set
      item_id = v_item.id, code = v_code, name = nullif(p_data->>'name', ''),
      output_qty = coalesce((p_data->>'output_qty')::numeric, 1),
      is_default = v_is_default,
      is_active = coalesce((p_data->>'is_active')::boolean, true),
      notes = nullif(p_data->>'notes', '')
    where id = v_id;
    if not found then raise exception 'BOM tidak ditemukan'; end if;
    delete from bom_lines where bom_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_data->'lines') loop
    if (v_line->>'material_id')::uuid = v_item.id then
      raise exception 'Material tidak boleh sama dengan produk';
    end if;
    if exists (select 1 from items where id = (v_line->>'material_id')::uuid and item_type = 'FG') then
      raise exception 'Material BOM harus bahan baku/kemasan (bukan FG)';
    end if;
    v_sort := v_sort + 1;
    insert into bom_lines (bom_id, material_id, qty, scrap_pct, notes, sort)
    values (v_id, (v_line->>'material_id')::uuid, (v_line->>'qty')::numeric,
            coalesce((v_line->>'scrap_pct')::numeric, 0), nullif(v_line->>'notes', ''), v_sort);
  end loop;

  return v_id;
exception
  when unique_violation then
    raise exception 'Material duplikat di BOM atau kode BOM sudah dipakai';
end;
$$;

-- ---------------------------------------------------------------------
-- ORDER MASUK
-- ---------------------------------------------------------------------
create or replace function public.save_order(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_order orders%rowtype;
  v_line jsonb;
  v_sort int := 0;
  v_date date := coalesce((p_data->>'order_date')::date, current_date);
  v_status text := coalesce(nullif(p_data->>'status', ''), 'DRAFT');
begin
  if jsonb_array_length(coalesce(p_data->'lines', '[]'::jsonb)) = 0 then
    raise exception 'Order harus memiliki minimal 1 produk';
  end if;

  if v_id is null then
    if v_status not in ('DRAFT','CONFIRMED') then v_status := 'DRAFT'; end if;
    insert into orders (order_no, customer_id, customer_po, order_date, due_date, status, notes)
    values (next_doc_no('ORD', v_date), (p_data->>'customer_id')::uuid,
            nullif(p_data->>'customer_po', ''), v_date,
            nullif(p_data->>'due_date', '')::date, v_status, nullif(p_data->>'notes', ''))
    returning id into v_id;
  else
    select * into v_order from orders where id = v_id for update;
    if not found then raise exception 'Order tidak ditemukan'; end if;
    if v_order.status not in ('DRAFT','CONFIRMED','IN_PRODUCTION') then
      raise exception 'Order berstatus % tidak bisa diubah', v_order.status;
    end if;
    if exists (select 1 from order_lines where order_id = v_id and qty_delivered > 0) then
      raise exception 'Order sudah ada pengiriman, tidak bisa diubah';
    end if;
    update orders set
      customer_id = (p_data->>'customer_id')::uuid,
      customer_po = nullif(p_data->>'customer_po', ''),
      order_date = v_date,
      due_date = nullif(p_data->>'due_date', '')::date,
      notes = nullif(p_data->>'notes', '')
    where id = v_id;
    delete from order_lines where order_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_data->'lines') loop
    v_sort := v_sort + 1;
    insert into order_lines (order_id, item_id, qty, unit_price, notes, sort)
    values (v_id, (v_line->>'item_id')::uuid, (v_line->>'qty')::numeric,
            coalesce((v_line->>'unit_price')::numeric, 0), nullif(v_line->>'notes', ''), v_sort);
  end loop;

  return v_id;
end;
$$;

create or replace function public.set_order_status(p_id uuid, p_status text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;

  if p_status = 'CONFIRMED' and v_order.status = 'DRAFT' then
    update orders set status = 'CONFIRMED' where id = p_id;
  elsif p_status = 'DRAFT' and v_order.status = 'CONFIRMED' then
    update orders set status = 'DRAFT' where id = p_id;
  elsif p_status = 'CANCELLED' and v_order.status in ('DRAFT','CONFIRMED','IN_PRODUCTION') then
    if exists (select 1 from order_lines where order_id = p_id and qty_delivered > 0) then
      raise exception 'Order sudah ada pengiriman, tidak bisa dibatalkan';
    end if;
    if exists (select 1 from work_orders where order_id = p_id and status in ('PLANNED','IN_PROGRESS')) then
      raise exception 'Masih ada Work Order aktif untuk order ini. Batalkan/selesaikan WO terlebih dahulu';
    end if;
    update orders set status = 'CANCELLED' where id = p_id;
  elsif p_status = 'DELIVERED' and v_order.status = 'PARTIAL' then
    -- tutup order: sisa yang belum dikirim tidak akan dikirim
    update orders set status = 'DELIVERED' where id = p_id;
  else
    raise exception 'Perubahan status % -> % tidak diizinkan', v_order.status, p_status;
  end if;
end;
$$;

create or replace function public.delete_order(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from orders where id = p_id and status = 'DRAFT') then
    raise exception 'Hanya order DRAFT yang bisa dihapus';
  end if;
  delete from orders where id = p_id;
end;
$$;

-- Pengiriman (Surat Jalan): mengurangi stok FG
create or replace function public.deliver_order(
  p_order_id uuid, p_lines jsonb, p_date date default current_date, p_notes text default null
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_del_id uuid;
  v_del_no text;
  v_line jsonb;
  v_ol order_lines%rowtype;
  v_qty numeric;
  v_msgs text[] := '{}';
  v_msg text;
  v_need jsonb := '{}'::jsonb;
  v_key text;
  v_count int := 0;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;
  if v_order.status not in ('CONFIRMED','IN_PRODUCTION','PARTIAL') then
    raise exception 'Order berstatus % tidak bisa dikirim', v_order.status;
  end if;

  -- validasi qty & kumpulkan kebutuhan stok per item
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    continue when v_qty <= 0;
    select * into v_ol from order_lines
    where id = (v_line->>'order_line_id')::uuid and order_id = p_order_id for update;
    if not found then raise exception 'Baris order tidak valid'; end if;
    if v_qty > v_ol.qty - v_ol.qty_delivered then
      raise exception 'Qty kirim melebihi sisa order (sisa %)', trim_scale(v_ol.qty - v_ol.qty_delivered);
    end if;
    v_need := jsonb_set(v_need, array[v_ol.item_id::text],
                        to_jsonb(coalesce((v_need->>v_ol.item_id::text)::numeric, 0) + v_qty));
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'Isi minimal satu qty pengiriman'; end if;

  for v_key in select jsonb_object_keys(v_need) loop
    v_msg := _shortage(v_key::uuid, (v_need->>v_key)::numeric);
    if v_msg is not null then v_msgs := v_msgs || v_msg; end if;
  end loop;
  if array_length(v_msgs, 1) > 0 then
    raise exception 'Stok barang jadi tidak cukup: %', array_to_string(v_msgs, '; ');
  end if;

  v_del_no := next_doc_no('SJ', p_date);
  insert into deliveries (delivery_no, order_id, delivery_date, notes)
  values (v_del_no, p_order_id, coalesce(p_date, current_date), p_notes)
  returning id into v_del_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    continue when v_qty <= 0;
    select * into v_ol from order_lines where id = (v_line->>'order_line_id')::uuid;
    insert into delivery_lines (delivery_id, order_line_id, item_id, qty)
    values (v_del_id, v_ol.id, v_ol.item_id, v_qty);
    update order_lines set qty_delivered = qty_delivered + v_qty where id = v_ol.id;
    perform _post_movement(v_ol.item_id, -v_qty, 'DELIVERY', p_date,
                           'DELIVERY', v_del_id, v_del_no, 'Kirim ' || v_order.order_no);
  end loop;

  perform _refresh_order_status(p_order_id);
  return v_del_id;
end;
$$;

-- ---------------------------------------------------------------------
-- WORK ORDER
-- ---------------------------------------------------------------------
create or replace function public.create_work_order(
  p_item_id uuid, p_qty numeric, p_order_id uuid default null,
  p_planned_date date default current_date, p_bom_id uuid default null, p_notes text default null
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_bom boms%rowtype;
  v_wo_id uuid;
begin
  if coalesce(p_qty, 0) <= 0 then raise exception 'Qty produksi harus > 0'; end if;

  if p_bom_id is not null then
    select * into v_bom from boms where id = p_bom_id and item_id = p_item_id;
  else
    select * into v_bom from boms
    where item_id = p_item_id and is_active
    order by is_default desc, created_at desc limit 1;
  end if;
  if not found then
    raise exception 'Produk ini belum memiliki BOM aktif. Buat BOM terlebih dahulu';
  end if;

  if p_order_id is not null and not exists (
    select 1 from orders where id = p_order_id and status in ('CONFIRMED','IN_PRODUCTION','PARTIAL')
  ) then
    raise exception 'Order harus dikonfirmasi sebelum dibuatkan Work Order';
  end if;

  insert into work_orders (wo_no, order_id, item_id, bom_id, qty_planned, planned_date, notes)
  values (next_doc_no('WO', p_planned_date), p_order_id, p_item_id, v_bom.id, p_qty,
          coalesce(p_planned_date, current_date), p_notes)
  returning id into v_wo_id;

  insert into work_order_materials (wo_id, item_id, qty_required)
  select v_wo_id, bl.material_id,
         round(p_qty / v_bom.output_qty * bl.qty * (1 + bl.scrap_pct / 100), 6)
  from bom_lines bl where bl.bom_id = v_bom.id;

  perform _refresh_order_status(p_order_id);
  return v_wo_id;
end;
$$;

create or replace function public.set_work_order_status(p_id uuid, p_status text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_wo work_orders%rowtype;
begin
  select * into v_wo from work_orders where id = p_id for update;
  if not found then raise exception 'Work Order tidak ditemukan'; end if;

  if p_status = 'IN_PROGRESS' and v_wo.status = 'PLANNED' then
    update work_orders set status = 'IN_PROGRESS' where id = p_id;
  elsif p_status = 'PLANNED' and v_wo.status = 'IN_PROGRESS' then
    update work_orders set status = 'PLANNED' where id = p_id;
  elsif p_status = 'CANCELLED' and v_wo.status in ('PLANNED','IN_PROGRESS') then
    update work_orders set status = 'CANCELLED' where id = p_id;
    perform _refresh_order_status(v_wo.order_id);
  else
    raise exception 'Perubahan status % -> % tidak diizinkan', v_wo.status, p_status;
  end if;
end;
$$;

-- Selesaikan produksi: backflush material (kurangi stok) & tambah stok FG.
-- p_materials: [{item_id, qty}] konsumsi aktual; null = sesuai kebutuhan WO.
create or replace function public.complete_work_order(
  p_id uuid, p_qty_produced numeric, p_date date default current_date,
  p_materials jsonb default null, p_notes text default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_wo work_orders%rowtype;
  v_m record;
  v_qty numeric;
  v_msgs text[] := '{}';
  v_msg text;
  v_total_cost numeric := 0;
  v_unit_cost numeric;
  v_consume jsonb := '{}'::jsonb;
  v_key text;
begin
  select * into v_wo from work_orders where id = p_id for update;
  if not found then raise exception 'Work Order tidak ditemukan'; end if;
  if v_wo.status not in ('PLANNED','IN_PROGRESS') then
    raise exception 'Work Order berstatus % tidak bisa diselesaikan', v_wo.status;
  end if;
  if coalesce(p_qty_produced, 0) <= 0 then
    raise exception 'Qty hasil produksi harus > 0';
  end if;

  -- tentukan qty konsumsi per material: {item_id: qty}
  for v_m in select * from work_order_materials where wo_id = p_id loop
    if p_materials is null then
      v_qty := v_m.qty_required;
    else
      v_qty := null;
      select (e->>'qty')::numeric into v_qty
      from jsonb_array_elements(p_materials) e
      where (e->>'item_id')::uuid = v_m.item_id
      limit 1;
      v_qty := coalesce(v_qty, 0);
    end if;
    if v_qty < 0 then raise exception 'Qty konsumsi tidak boleh negatif'; end if;
    v_consume := v_consume || jsonb_build_object(v_m.item_id::text, v_qty);
  end loop;

  -- cek stok material (semua sekaligus)
  for v_key in select key from jsonb_each_text(v_consume) where value::numeric > 0 loop
    v_msg := _shortage(v_key::uuid, (v_consume->>v_key)::numeric);
    if v_msg is not null then v_msgs := v_msgs || v_msg; end if;
  end loop;
  if array_length(v_msgs, 1) > 0 then
    raise exception 'Stok material tidak cukup: %', array_to_string(v_msgs, '; ');
  end if;

  -- konsumsi material
  for v_m in select i.id as item_id, c.value::numeric as qty, i.cost_price
             from jsonb_each_text(v_consume) c
             join items i on i.id = c.key::uuid
             where c.value::numeric > 0 loop
    perform _post_movement(v_m.item_id, -v_m.qty, 'PRODUCTION_CONSUME', p_date,
                           'WORK_ORDER', p_id, v_wo.wo_no, p_notes, v_m.cost_price);
    v_total_cost := v_total_cost + v_m.qty * v_m.cost_price;
  end loop;
  update work_order_materials m set qty_consumed = (v_consume->>m.item_id::text)::numeric
  where m.wo_id = p_id;

  -- hasil produksi (HPP per unit = total biaya material / qty hasil)
  v_unit_cost := round(v_total_cost / p_qty_produced, 4);
  perform _post_movement(v_wo.item_id, p_qty_produced, 'PRODUCTION_OUTPUT', p_date,
                         'WORK_ORDER', p_id, v_wo.wo_no, p_notes, v_unit_cost);
  if v_unit_cost > 0 then
    update items set cost_price = v_unit_cost where id = v_wo.item_id;
  end if;

  update work_orders set
    status = 'COMPLETED', qty_produced = p_qty_produced, completed_at = now(),
    notes = coalesce(p_notes, notes)
  where id = p_id;

  perform _refresh_order_status(v_wo.order_id);
end;
$$;

-- ---------------------------------------------------------------------
-- PURCHASE ORDER
-- ---------------------------------------------------------------------
create or replace function public.save_purchase_order(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_po purchase_orders%rowtype;
  v_line jsonb;
  v_sort int := 0;
  v_date date := coalesce((p_data->>'order_date')::date, current_date);
  v_tax_rate numeric := coalesce((p_data->>'tax_rate')::numeric, 0);
  v_subtotal numeric;
  v_tax numeric;
begin
  if jsonb_array_length(coalesce(p_data->'lines', '[]'::jsonb)) = 0 then
    raise exception 'PO harus memiliki minimal 1 item';
  end if;

  if v_id is null then
    insert into purchase_orders (po_no, supplier_id, order_date, expected_date, tax_rate, source, notes)
    values (next_doc_no('PO', v_date), (p_data->>'supplier_id')::uuid, v_date,
            nullif(p_data->>'expected_date', '')::date, v_tax_rate,
            coalesce(nullif(p_data->>'source', ''), 'MANUAL'), nullif(p_data->>'notes', ''))
    returning id into v_id;
  else
    select * into v_po from purchase_orders where id = v_id for update;
    if not found then raise exception 'PO tidak ditemukan'; end if;
    if v_po.status <> 'DRAFT' then raise exception 'Hanya PO DRAFT yang bisa diubah'; end if;
    update purchase_orders set
      supplier_id = (p_data->>'supplier_id')::uuid,
      order_date = v_date,
      expected_date = nullif(p_data->>'expected_date', '')::date,
      tax_rate = v_tax_rate,
      notes = nullif(p_data->>'notes', '')
    where id = v_id;
    delete from po_lines where po_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_data->'lines') loop
    v_sort := v_sort + 1;
    insert into po_lines (po_id, item_id, qty, unit_price, notes, sort)
    values (v_id, (v_line->>'item_id')::uuid, (v_line->>'qty')::numeric,
            coalesce((v_line->>'unit_price')::numeric, 0), nullif(v_line->>'notes', ''), v_sort);
  end loop;

  select round(coalesce(sum(qty * unit_price), 0), 2) into v_subtotal from po_lines where po_id = v_id;
  v_tax := round(v_subtotal * v_tax_rate / 100, 0);
  update purchase_orders set subtotal = v_subtotal, tax_amount = v_tax, total = v_subtotal + v_tax
  where id = v_id;

  return v_id;
end;
$$;

create or replace function public.set_purchase_order_status(p_id uuid, p_status text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_po purchase_orders%rowtype;
  v_has_receipt boolean;
begin
  select * into v_po from purchase_orders where id = p_id for update;
  if not found then raise exception 'PO tidak ditemukan'; end if;
  v_has_receipt := exists (select 1 from po_lines where po_id = p_id and qty_received > 0);

  if p_status = 'ORDERED' and v_po.status = 'DRAFT' then
    update purchase_orders set status = 'ORDERED' where id = p_id;
  elsif p_status = 'DRAFT' and v_po.status = 'ORDERED' and not v_has_receipt then
    update purchase_orders set status = 'DRAFT' where id = p_id;
  elsif p_status = 'CANCELLED' and v_po.status in ('DRAFT','ORDERED') and not v_has_receipt then
    update purchase_orders set status = 'CANCELLED' where id = p_id;
  elsif p_status = 'RECEIVED' and v_po.status = 'PARTIAL' then
    -- tutup PO: sisa tidak akan diterima
    update purchase_orders set status = 'RECEIVED' where id = p_id;
  else
    raise exception 'Perubahan status % -> % tidak diizinkan', v_po.status, p_status;
  end if;
end;
$$;

create or replace function public.delete_purchase_order(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from purchase_orders where id = p_id and status = 'DRAFT') then
    raise exception 'Hanya PO DRAFT yang bisa dihapus';
  end if;
  delete from purchase_orders where id = p_id;
end;
$$;

-- Penerimaan barang: menambah stok & update harga beli terakhir
create or replace function public.receive_purchase_order(
  p_po_id uuid, p_lines jsonb, p_date date default current_date, p_notes text default null
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_po purchase_orders%rowtype;
  v_gr_id uuid;
  v_gr_no text;
  v_line jsonb;
  v_pl po_lines%rowtype;
  v_qty numeric;
  v_count int := 0;
begin
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'PO tidak ditemukan'; end if;
  if v_po.status not in ('ORDERED','PARTIAL') then
    raise exception 'PO berstatus % tidak bisa diterima. Tandai PO sebagai ORDERED terlebih dahulu', v_po.status;
  end if;

  v_gr_no := next_doc_no('GRN', p_date);
  insert into goods_receipts (gr_no, po_id, receipt_date, notes)
  values (v_gr_no, p_po_id, coalesce(p_date, current_date), p_notes)
  returning id into v_gr_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    continue when v_qty <= 0;
    select * into v_pl from po_lines
    where id = (v_line->>'po_line_id')::uuid and po_id = p_po_id for update;
    if not found then raise exception 'Baris PO tidak valid'; end if;
    if v_qty > v_pl.qty - v_pl.qty_received then
      raise exception 'Qty terima melebihi sisa PO (sisa %)', trim_scale(v_pl.qty - v_pl.qty_received);
    end if;

    insert into goods_receipt_lines (gr_id, po_line_id, item_id, qty)
    values (v_gr_id, v_pl.id, v_pl.item_id, v_qty);
    update po_lines set qty_received = qty_received + v_qty where id = v_pl.id;
    perform _post_movement(v_pl.item_id, v_qty, 'PURCHASE_RECEIPT', p_date,
                           'GOODS_RECEIPT', v_gr_id, v_gr_no, 'Terima ' || v_po.po_no, v_pl.unit_price);
    if v_pl.unit_price > 0 then
      update items set cost_price = v_pl.unit_price where id = v_pl.item_id;
    end if;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then raise exception 'Isi minimal satu qty penerimaan'; end if;

  update purchase_orders set status =
    case when exists (select 1 from po_lines where po_id = p_po_id and qty_received < qty)
         then 'PARTIAL' else 'RECEIVED' end
  where id = p_po_id;

  return v_gr_id;
end;
$$;

-- ---------------------------------------------------------------------
-- INVOICE
-- ---------------------------------------------------------------------
create or replace function public.save_invoice(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_inv invoices%rowtype;
  v_line jsonb;
  v_sort int := 0;
  v_date date := coalesce((p_data->>'invoice_date')::date, current_date);
  v_order_id uuid := nullif(p_data->>'order_id', '')::uuid;
  v_tax_rate numeric := coalesce((p_data->>'tax_rate')::numeric, 11);
  v_discount numeric := coalesce((p_data->>'discount_amount')::numeric, 0);
  v_deduct boolean := coalesce((p_data->>'deduct_stock')::boolean, false);
  v_qty numeric; v_price numeric; v_disc numeric;
  v_subtotal numeric; v_dpp numeric; v_tax numeric;
begin
  if jsonb_array_length(coalesce(p_data->'lines', '[]'::jsonb)) = 0 then
    raise exception 'Invoice harus memiliki minimal 1 baris';
  end if;
  -- Invoice dari order: stok sudah berkurang lewat pengiriman (Surat Jalan)
  if v_order_id is not null then v_deduct := false; end if;

  if v_id is null then
    insert into invoices (invoice_no, customer_id, order_id, invoice_date, due_date,
                          tax_rate, discount_amount, deduct_stock, notes)
    values (next_doc_no('INV', v_date), (p_data->>'customer_id')::uuid, v_order_id, v_date,
            nullif(p_data->>'due_date', '')::date, v_tax_rate, v_discount, v_deduct,
            nullif(p_data->>'notes', ''))
    returning id into v_id;
  else
    select * into v_inv from invoices where id = v_id for update;
    if not found then raise exception 'Invoice tidak ditemukan'; end if;
    if v_inv.status <> 'DRAFT' then raise exception 'Hanya invoice DRAFT yang bisa diubah'; end if;
    update invoices set
      customer_id = (p_data->>'customer_id')::uuid,
      order_id = v_order_id,
      invoice_date = v_date,
      due_date = nullif(p_data->>'due_date', '')::date,
      tax_rate = v_tax_rate,
      discount_amount = v_discount,
      deduct_stock = v_deduct,
      notes = nullif(p_data->>'notes', '')
    where id = v_id;
    delete from invoice_lines where invoice_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_data->'lines') loop
    v_sort := v_sort + 1;
    v_qty := (v_line->>'qty')::numeric;
    v_price := coalesce((v_line->>'unit_price')::numeric, 0);
    v_disc := coalesce((v_line->>'discount_pct')::numeric, 0);
    if coalesce(trim(v_line->>'description'), '') = '' then
      raise exception 'Deskripsi baris invoice wajib diisi';
    end if;
    insert into invoice_lines (invoice_id, item_id, description, qty, unit, unit_price,
                               discount_pct, line_total, sort)
    values (v_id, nullif(v_line->>'item_id', '')::uuid, v_line->>'description', v_qty,
            nullif(v_line->>'unit', ''), v_price, v_disc,
            round(v_qty * v_price * (1 - v_disc / 100), 2), v_sort);
  end loop;

  select coalesce(sum(line_total), 0) into v_subtotal from invoice_lines where invoice_id = v_id;
  if v_discount > v_subtotal then raise exception 'Diskon melebihi subtotal'; end if;
  v_dpp := v_subtotal - v_discount;
  v_tax := round(v_dpp * v_tax_rate / 100, 0);
  update invoices set subtotal = v_subtotal, dpp = v_dpp, tax_amount = v_tax,
                      total = v_dpp + v_tax
  where id = v_id;

  return v_id;
end;
$$;

create or replace function public.issue_invoice(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_inv invoices%rowtype;
  v_l record;
  v_msgs text[] := '{}';
  v_msg text;
begin
  select * into v_inv from invoices where id = p_id for update;
  if not found then raise exception 'Invoice tidak ditemukan'; end if;
  if v_inv.status <> 'DRAFT' then raise exception 'Invoice sudah diterbitkan'; end if;

  if v_inv.deduct_stock then
    for v_l in select item_id, sum(qty) as qty from invoice_lines
               where invoice_id = p_id and item_id is not null group by item_id loop
      v_msg := _shortage(v_l.item_id, v_l.qty);
      if v_msg is not null then v_msgs := v_msgs || v_msg; end if;
    end loop;
    if array_length(v_msgs, 1) > 0 then
      raise exception 'Stok tidak cukup: %', array_to_string(v_msgs, '; ');
    end if;
    for v_l in select item_id, sum(qty) as qty from invoice_lines
               where invoice_id = p_id and item_id is not null group by item_id loop
      perform _post_movement(v_l.item_id, -v_l.qty, 'INVOICE', v_inv.invoice_date,
                             'INVOICE', p_id, v_inv.invoice_no, 'Penjualan langsung');
    end loop;
  end if;

  update invoices set status = 'ISSUED', issued_at = now() where id = p_id;
end;
$$;

create or replace function public.void_invoice(p_id uuid, p_reason text default null)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_inv invoices%rowtype;
  v_m record;
begin
  select * into v_inv from invoices where id = p_id for update;
  if not found then raise exception 'Invoice tidak ditemukan'; end if;
  if v_inv.status = 'VOID' then raise exception 'Invoice sudah VOID'; end if;
  if v_inv.amount_paid > 0 then
    raise exception 'Invoice sudah ada pembayaran. Hapus pembayaran terlebih dahulu';
  end if;

  -- kembalikan stok yang dikurangi saat terbit
  for v_m in select item_id, sum(qty) as qty, max(unit_cost) as unit_cost
             from stock_movements
             where ref_type = 'INVOICE' and ref_id = p_id
             group by item_id loop
    if v_m.qty <> 0 then
      perform _post_movement(v_m.item_id, -v_m.qty, 'INVOICE_VOID', current_date,
                             'INVOICE', p_id, v_inv.invoice_no, 'Void invoice', v_m.unit_cost);
    end if;
  end loop;

  update invoices set status = 'VOID',
    notes = case when p_reason is null or p_reason = '' then notes
                 else coalesce(notes || E'\n', '') || 'VOID: ' || p_reason end
  where id = p_id;
end;
$$;

create or replace function public.delete_invoice(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from invoices where id = p_id and status = 'DRAFT') then
    raise exception 'Hanya invoice DRAFT yang bisa dihapus';
  end if;
  delete from invoices where id = p_id;
end;
$$;

create or replace function public._refresh_invoice_payment(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_paid numeric;
begin
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = p_id;
  update invoices set
    amount_paid = v_paid,
    status = case when v_paid >= total then 'PAID'
                  when v_paid > 0 then 'PARTIAL'
                  else 'ISSUED' end
  where id = p_id;
end;
$$;

create or replace function public.add_payment(
  p_invoice_id uuid, p_amount numeric, p_date date default current_date,
  p_method text default 'TRANSFER', p_reference text default null, p_notes text default null
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_inv invoices%rowtype;
  v_id uuid;
begin
  select * into v_inv from invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice tidak ditemukan'; end if;
  if v_inv.status not in ('ISSUED','PARTIAL') then
    raise exception 'Pembayaran hanya untuk invoice yang sudah terbit dan belum lunas';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Jumlah pembayaran harus > 0'; end if;
  if p_amount > v_inv.total - v_inv.amount_paid then
    raise exception 'Pembayaran melebihi sisa tagihan (%)', v_inv.total - v_inv.amount_paid;
  end if;

  insert into payments (invoice_id, payment_date, amount, method, reference, notes)
  values (p_invoice_id, coalesce(p_date, current_date), p_amount, coalesce(p_method, 'TRANSFER'),
          nullif(p_reference, ''), nullif(p_notes, ''))
  returning id into v_id;

  perform _refresh_invoice_payment(p_invoice_id);
  return v_id;
end;
$$;

create or replace function public.delete_payment(p_payment_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_invoice_id uuid;
begin
  select invoice_id into v_invoice_id from payments where id = p_payment_id;
  if v_invoice_id is null then raise exception 'Pembayaran tidak ditemukan'; end if;
  perform 1 from invoices where id = v_invoice_id for update;
  delete from payments where id = p_payment_id;
  perform _refresh_invoice_payment(v_invoice_id);
end;
$$;

-- ---------------------------------------------------------------------
-- PENYESUAIAN STOK / STOCK OPNAME
-- p_mode: 'DELTA' (tambah/kurang) | 'SET' (stok fisik hasil opname)
-- ---------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_item_id uuid, p_mode text, p_qty numeric, p_date date default current_date,
  p_notes text default null, p_unit_cost numeric default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_on_hand numeric;
  v_delta numeric;
  v_type text := 'ADJUSTMENT';
begin
  perform 1 from items where id = p_item_id for update;
  if not found then raise exception 'Item tidak ditemukan'; end if;
  v_on_hand := _on_hand(p_item_id);

  if p_mode = 'SET' then
    if p_qty < 0 then raise exception 'Stok fisik tidak boleh negatif'; end if;
    v_delta := p_qty - v_on_hand;
  elsif p_mode = 'DELTA' then
    v_delta := p_qty;
  else
    raise exception 'Mode penyesuaian tidak dikenal';
  end if;

  if v_delta = 0 then raise exception 'Tidak ada perubahan stok'; end if;
  if v_on_hand + v_delta < 0 then
    raise exception 'Stok akhir tidak boleh negatif (stok saat ini %)', trim_scale(v_on_hand);
  end if;
  if not exists (select 1 from stock_movements where item_id = p_item_id) then
    v_type := 'OPENING';
  end if;
  if p_unit_cost is not null and p_unit_cost > 0 then
    update items set cost_price = p_unit_cost where id = p_item_id;
  end if;

  perform _post_movement(p_item_id, v_delta, v_type, p_date, 'ADJUSTMENT', null,
                         null, coalesce(nullif(p_notes, ''), 'Penyesuaian stok'), p_unit_cost);
end;
$$;
