-- =====================================================================
-- Data contoh (opsional). Jalankan setelah migrasi untuk mencoba aplikasi.
-- =====================================================================

update public.company_settings set
  name = 'Aynafood',
  address = 'Jl. Contoh No. 1, Bandung',
  phone = '0812-0000-0000',
  email = 'admin@aynafood.id',
  bank_name = 'BCA',
  bank_account = '1234567890',
  bank_holder = 'Aynafood',
  invoice_footer = 'Terima kasih atas kepercayaan Anda.'
where id = 1;

insert into public.suppliers (code, name, phone, lead_time_days) values
  ('SUP-001', 'CV Kedelai Makmur', '0811-111-111', 3),
  ('SUP-002', 'Toko Minyak Sejahtera', '0811-222-222', 2),
  ('SUP-003', 'PT Kemasan Prima', '0811-333-333', 7);

insert into public.customers (code, name, phone, address, payment_terms) values
  ('CUS-001', 'Toko Oleh-Oleh Sari', '0812-111-000', 'Bandung', 14),
  ('CUS-002', 'Minimarket Berkah', '0812-222-000', 'Cimahi', 30);

insert into public.items (sku, name, item_type, unit, sale_price, cost_price, min_stock, moq, order_multiple, default_supplier_id) values
  ('FG-KT250', 'Keripik Tempe 250g',   'FG',  'pcs', 18000, 0, 20, 0, 0, null),
  ('FG-KT500', 'Keripik Tempe 500g',   'FG',  'pcs', 34000, 0, 10, 0, 0, null),
  ('RM-TMP',   'Tempe Mentah',         'RM',  'kg',  0, 14000, 10, 10, 5,  (select id from public.suppliers where code = 'SUP-001')),
  ('RM-MYK',   'Minyak Goreng',        'RM',  'liter', 0, 17000, 10, 18, 18, (select id from public.suppliers where code = 'SUP-002')),
  ('RM-TPG',   'Tepung Bumbu',         'RM',  'kg',  0, 22000, 5, 5, 5,   (select id from public.suppliers where code = 'SUP-001')),
  ('PKG-P250', 'Standing Pouch 250g',  'PKG', 'pcs', 0, 900, 100, 500, 100, (select id from public.suppliers where code = 'SUP-003')),
  ('PKG-P500', 'Standing Pouch 500g',  'PKG', 'pcs', 0, 1200, 50, 500, 100, (select id from public.suppliers where code = 'SUP-003')),
  ('PKG-LBL',  'Label Stiker',         'PKG', 'pcs', 0, 150, 200, 1000, 500, (select id from public.suppliers where code = 'SUP-003'));

-- BOM: per 100 pcs Keripik Tempe 250g
select public.save_bom(null, jsonb_build_object(
  'item_id', (select id from public.items where sku = 'FG-KT250'),
  'code', 'BOM-KT250', 'name', 'Resep standar 250g', 'output_qty', 100, 'is_default', true,
  'lines', jsonb_build_array(
    jsonb_build_object('material_id', (select id from public.items where sku = 'RM-TMP'),   'qty', 30,  'scrap_pct', 5),
    jsonb_build_object('material_id', (select id from public.items where sku = 'RM-MYK'),   'qty', 8,   'scrap_pct', 0),
    jsonb_build_object('material_id', (select id from public.items where sku = 'RM-TPG'),   'qty', 4,   'scrap_pct', 0),
    jsonb_build_object('material_id', (select id from public.items where sku = 'PKG-P250'), 'qty', 100, 'scrap_pct', 2),
    jsonb_build_object('material_id', (select id from public.items where sku = 'PKG-LBL'),  'qty', 100, 'scrap_pct', 2)
  )));

-- BOM: per 50 pcs Keripik Tempe 500g
select public.save_bom(null, jsonb_build_object(
  'item_id', (select id from public.items where sku = 'FG-KT500'),
  'code', 'BOM-KT500', 'name', 'Resep standar 500g', 'output_qty', 50, 'is_default', true,
  'lines', jsonb_build_array(
    jsonb_build_object('material_id', (select id from public.items where sku = 'RM-TMP'),   'qty', 30, 'scrap_pct', 5),
    jsonb_build_object('material_id', (select id from public.items where sku = 'RM-MYK'),   'qty', 8,  'scrap_pct', 0),
    jsonb_build_object('material_id', (select id from public.items where sku = 'RM-TPG'),   'qty', 4,  'scrap_pct', 0),
    jsonb_build_object('material_id', (select id from public.items where sku = 'PKG-P500'), 'qty', 50, 'scrap_pct', 2),
    jsonb_build_object('material_id', (select id from public.items where sku = 'PKG-LBL'),  'qty', 50, 'scrap_pct', 2)
  )));

-- Stok awal
select public.adjust_stock((select id from public.items where sku = 'FG-KT250'), 'SET', 40,  current_date, 'Stok awal');
select public.adjust_stock((select id from public.items where sku = 'RM-TMP'),   'SET', 50,  current_date, 'Stok awal');
select public.adjust_stock((select id from public.items where sku = 'RM-MYK'),   'SET', 20,  current_date, 'Stok awal');
select public.adjust_stock((select id from public.items where sku = 'RM-TPG'),   'SET', 3,   current_date, 'Stok awal');
select public.adjust_stock((select id from public.items where sku = 'PKG-P250'), 'SET', 250, current_date, 'Stok awal');
select public.adjust_stock((select id from public.items where sku = 'PKG-LBL'),  'SET', 300, current_date, 'Stok awal');

-- Order contoh (terkonfirmasi)
select public.save_order(null, jsonb_build_object(
  'customer_id', (select id from public.customers where code = 'CUS-001'),
  'order_date', current_date, 'due_date', current_date + 7, 'status', 'CONFIRMED',
  'lines', jsonb_build_array(
    jsonb_build_object('item_id', (select id from public.items where sku = 'FG-KT250'), 'qty', 300, 'unit_price', 18000),
    jsonb_build_object('item_id', (select id from public.items where sku = 'FG-KT500'), 'qty', 100, 'unit_price', 34000)
  )));
select public.save_order(null, jsonb_build_object(
  'customer_id', (select id from public.customers where code = 'CUS-002'),
  'order_date', current_date, 'due_date', current_date + 14, 'status', 'CONFIRMED',
  'lines', jsonb_build_array(
    jsonb_build_object('item_id', (select id from public.items where sku = 'FG-KT250'), 'qty', 200, 'unit_price', 17500)
  )));
