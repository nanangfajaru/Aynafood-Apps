-- =====================================================================
-- Aynafood Apps — Invoicing, MRP & Inventory
-- 01. Schema: master data, dokumen transaksi, ledger stok
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Pengaturan perusahaan (single row)
-- ---------------------------------------------------------------------
create table public.company_settings (
  id                    int primary key default 1 check (id = 1),
  name                  text not null default 'Aynafood',
  address               text,
  phone                 text,
  email                 text,
  npwp                  text,
  logo_url              text,
  bank_name             text,
  bank_account          text,
  bank_holder           text,
  default_tax_rate      numeric(5,2) not null default 11,
  default_payment_terms int not null default 30,
  invoice_footer        text,
  updated_at            timestamptz not null default now()
);
insert into public.company_settings (id) values (1);

-- ---------------------------------------------------------------------
-- Penomoran dokumen: PREFIX/YYYY/MM/0001
-- ---------------------------------------------------------------------
create table public.doc_sequences (
  doc_type text not null,
  period   text not null,
  last_no  int  not null,
  primary key (doc_type, period)
);

-- ---------------------------------------------------------------------
-- Master: Customer & Supplier
-- ---------------------------------------------------------------------
create table public.customers (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  contact_person text,
  phone          text,
  email          text,
  address        text,
  npwp           text,
  payment_terms  int not null default 30,
  is_active      boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  contact_person text,
  phone          text,
  email          text,
  address        text,
  npwp           text,
  lead_time_days int not null default 0 check (lead_time_days >= 0),
  is_active      boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Master: Item (FG = barang jadi, RM = bahan baku, PKG = kemasan)
-- ---------------------------------------------------------------------
create table public.items (
  id                  uuid primary key default gen_random_uuid(),
  sku                 text not null unique,
  name                text not null,
  item_type           text not null check (item_type in ('FG', 'RM', 'PKG')),
  unit                text not null default 'pcs',
  sale_price          numeric(18,2) not null default 0 check (sale_price >= 0),
  cost_price          numeric(18,4) not null default 0 check (cost_price >= 0),
  min_stock           numeric(18,4) not null default 0 check (min_stock >= 0),  -- safety stock
  moq                 numeric(18,4) not null default 0 check (moq >= 0),        -- minimum order qty
  order_multiple      numeric(18,4) not null default 0 check (order_multiple >= 0), -- kelipatan beli
  lead_time_days      int not null default 0 check (lead_time_days >= 0),
  default_supplier_id uuid references public.suppliers(id) on delete set null,
  is_active           boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index items_type_idx on public.items(item_type);

-- ---------------------------------------------------------------------
-- BOM (single level): 1 FG -> n material untuk menghasilkan output_qty
-- ---------------------------------------------------------------------
create table public.boms (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id) on delete restrict,
  code       text not null unique,
  name       text,
  output_qty numeric(18,4) not null default 1 check (output_qty > 0),
  is_default boolean not null default true,
  is_active  boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index boms_one_default_per_item on public.boms(item_id) where is_default;

create table public.bom_lines (
  id          uuid primary key default gen_random_uuid(),
  bom_id      uuid not null references public.boms(id) on delete cascade,
  material_id uuid not null references public.items(id) on delete restrict,
  qty         numeric(18,6) not null check (qty > 0),
  scrap_pct   numeric(6,2) not null default 0 check (scrap_pct >= 0 and scrap_pct < 100),
  notes       text,
  sort        int not null default 0,
  unique (bom_id, material_id)
);
create index bom_lines_material_idx on public.bom_lines(material_id);

-- ---------------------------------------------------------------------
-- Order masuk (pesanan customer)
-- ---------------------------------------------------------------------
create table public.orders (
  id          uuid primary key default gen_random_uuid(),
  order_no    text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_po text,                     -- nomor PO dari customer (opsional)
  order_date  date not null default current_date,
  due_date    date,                     -- tanggal kirim yang diminta
  status      text not null default 'DRAFT'
              check (status in ('DRAFT','CONFIRMED','IN_PRODUCTION','PARTIAL','DELIVERED','CANCELLED')),
  notes       text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index orders_status_idx on public.orders(status);
create index orders_customer_idx on public.orders(customer_id);

create table public.order_lines (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  item_id       uuid not null references public.items(id) on delete restrict,
  qty           numeric(18,4) not null check (qty > 0),
  unit_price    numeric(18,2) not null default 0 check (unit_price >= 0),
  qty_delivered numeric(18,4) not null default 0 check (qty_delivered >= 0),
  notes         text,
  sort          int not null default 0
);
create index order_lines_order_idx on public.order_lines(order_id);
create index order_lines_item_idx on public.order_lines(item_id);

-- Pengiriman / Surat Jalan
create table public.deliveries (
  id            uuid primary key default gen_random_uuid(),
  delivery_no   text not null unique,
  order_id      uuid not null references public.orders(id) on delete restrict,
  delivery_date date not null default current_date,
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create table public.delivery_lines (
  id            uuid primary key default gen_random_uuid(),
  delivery_id   uuid not null references public.deliveries(id) on delete cascade,
  order_line_id uuid not null references public.order_lines(id) on delete restrict,
  item_id       uuid not null references public.items(id) on delete restrict,
  qty           numeric(18,4) not null check (qty > 0)
);

-- ---------------------------------------------------------------------
-- Work Order (produksi)
-- ---------------------------------------------------------------------
create table public.work_orders (
  id           uuid primary key default gen_random_uuid(),
  wo_no        text not null unique,
  order_id     uuid references public.orders(id) on delete set null,
  item_id      uuid not null references public.items(id) on delete restrict,
  bom_id       uuid not null references public.boms(id) on delete restrict,
  qty_planned  numeric(18,4) not null check (qty_planned > 0),
  qty_produced numeric(18,4) not null default 0 check (qty_produced >= 0),
  planned_date date not null default current_date,
  status       text not null default 'PLANNED'
               check (status in ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  notes        text,
  completed_at timestamptz,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index work_orders_status_idx on public.work_orders(status);
create index work_orders_order_idx on public.work_orders(order_id);

-- Snapshot kebutuhan material WO (BOM di-copy saat WO dibuat)
create table public.work_order_materials (
  id            uuid primary key default gen_random_uuid(),
  wo_id         uuid not null references public.work_orders(id) on delete cascade,
  item_id       uuid not null references public.items(id) on delete restrict,
  qty_required  numeric(18,6) not null check (qty_required >= 0),
  qty_consumed  numeric(18,6) not null default 0 check (qty_consumed >= 0),
  unique (wo_id, item_id)
);

-- ---------------------------------------------------------------------
-- Purchase Order & Penerimaan Barang
-- ---------------------------------------------------------------------
create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  po_no         text not null unique,
  supplier_id   uuid not null references public.suppliers(id) on delete restrict,
  order_date    date not null default current_date,
  expected_date date,
  status        text not null default 'DRAFT'
                check (status in ('DRAFT','ORDERED','PARTIAL','RECEIVED','CANCELLED')),
  tax_rate      numeric(5,2) not null default 0,
  subtotal      numeric(18,2) not null default 0,
  tax_amount    numeric(18,2) not null default 0,
  total         numeric(18,2) not null default 0,
  source        text not null default 'MANUAL' check (source in ('MANUAL','MRP')),
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index purchase_orders_status_idx on public.purchase_orders(status);

create table public.po_lines (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references public.purchase_orders(id) on delete cascade,
  item_id      uuid not null references public.items(id) on delete restrict,
  qty          numeric(18,4) not null check (qty > 0),
  unit_price   numeric(18,4) not null default 0 check (unit_price >= 0),
  qty_received numeric(18,4) not null default 0 check (qty_received >= 0),
  notes        text,
  sort         int not null default 0
);
create index po_lines_po_idx on public.po_lines(po_id);
create index po_lines_item_idx on public.po_lines(item_id);

create table public.goods_receipts (
  id           uuid primary key default gen_random_uuid(),
  gr_no        text not null unique,
  po_id        uuid not null references public.purchase_orders(id) on delete restrict,
  receipt_date date not null default current_date,
  notes        text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create table public.goods_receipt_lines (
  id         uuid primary key default gen_random_uuid(),
  gr_id      uuid not null references public.goods_receipts(id) on delete cascade,
  po_line_id uuid not null references public.po_lines(id) on delete restrict,
  item_id    uuid not null references public.items(id) on delete restrict,
  qty        numeric(18,4) not null check (qty > 0)
);

-- ---------------------------------------------------------------------
-- Invoice (tanpa SO; opsional ditautkan ke order)
-- ---------------------------------------------------------------------
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_no      text not null unique,
  customer_id     uuid not null references public.customers(id) on delete restrict,
  order_id        uuid references public.orders(id) on delete set null,
  invoice_date    date not null default current_date,
  due_date        date,
  status          text not null default 'DRAFT'
                  check (status in ('DRAFT','ISSUED','PARTIAL','PAID','VOID')),
  deduct_stock    boolean not null default false,  -- kurangi stok saat invoice diterbitkan
  subtotal        numeric(18,2) not null default 0,
  discount_amount numeric(18,2) not null default 0 check (discount_amount >= 0),
  dpp             numeric(18,2) not null default 0,  -- dasar pengenaan pajak
  tax_rate        numeric(5,2)  not null default 11,
  tax_amount      numeric(18,2) not null default 0,
  total           numeric(18,2) not null default 0,
  amount_paid     numeric(18,2) not null default 0,
  notes           text,
  issued_at       timestamptz,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index invoices_status_idx on public.invoices(status);
create index invoices_customer_idx on public.invoices(customer_id);
create index invoices_order_idx on public.invoices(order_id);

create table public.invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  item_id      uuid references public.items(id) on delete restrict,
  description  text not null,
  qty          numeric(18,4) not null check (qty > 0),
  unit         text,
  unit_price   numeric(18,2) not null default 0 check (unit_price >= 0),
  discount_pct numeric(5,2) not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  line_total   numeric(18,2) not null default 0,
  sort         int not null default 0
);
create index invoice_lines_invoice_idx on public.invoice_lines(invoice_id);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete restrict,
  payment_date date not null default current_date,
  amount       numeric(18,2) not null check (amount > 0),
  method       text not null default 'TRANSFER',
  reference    text,
  notes        text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index payments_invoice_idx on public.payments(invoice_id);

-- ---------------------------------------------------------------------
-- Ledger stok (kartu stok). Stok on hand = SUM(qty) per item.
-- ---------------------------------------------------------------------
create table public.stock_movements (
  id            bigint generated always as identity primary key,
  item_id       uuid not null references public.items(id) on delete restrict,
  movement_date date not null default current_date,
  movement_type text not null check (movement_type in (
                  'OPENING','ADJUSTMENT','PURCHASE_RECEIPT','PRODUCTION_CONSUME',
                  'PRODUCTION_OUTPUT','DELIVERY','INVOICE','INVOICE_VOID')),
  qty           numeric(18,6) not null check (qty <> 0),
  unit_cost     numeric(18,4),
  ref_type      text,
  ref_id        uuid,
  ref_no        text,
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index stock_movements_item_idx on public.stock_movements(item_id, movement_date);
create index stock_movements_ref_idx on public.stock_movements(ref_type, ref_id);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['company_settings','customers','suppliers','items','boms','orders',
                           'work_orders','purchase_orders','invoices']
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.tg_set_updated_at()', t);
  end loop;
end $$;
