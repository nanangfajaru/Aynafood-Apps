-- =====================================================================
-- 03. Row Level Security & hak akses
-- Model: semua user yang login (authenticated) punya akses penuh.
-- Role anon (belum login) tidak bisa membaca/menulis apa pun.
-- Nonaktifkan "Allow new users to sign up" di Supabase Auth dan
-- undang user lewat dashboard agar hanya tim internal yang bisa login.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'company_settings','doc_sequences','customers','suppliers','items','boms','bom_lines',
    'orders','order_lines','deliveries','delivery_lines','work_orders','work_order_materials',
    'purchase_orders','po_lines','goods_receipts','goods_receipt_lines',
    'invoices','invoice_lines','payments','stock_movements']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "authenticated full access" on public.%I
                    for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Ledger stok hanya boleh ditulis lewat fungsi (tidak boleh di-edit/hapus manual)
revoke update, delete on public.stock_movements from authenticated;

-- Views: hanya untuk user login
do $$
declare v text;
begin
  foreach v in array array['v_item_stock','v_orders','v_open_order_lines','v_invoices',
                           'v_purchase_orders','v_work_orders','v_stock_movements']
  loop
    execute format('revoke all on public.%I from anon', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- Fungsi: hanya authenticated yang boleh eksekusi
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
