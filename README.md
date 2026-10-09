# Aynafood Apps — Invoicing, MRP & Inventory

Aplikasi internal untuk **order masuk → perhitungan kebutuhan material (MRP) → saran PO → produksi (Work Order) → pengiriman → invoice (PPN 11%) → pembayaran**, dengan stok barang jadi & material yang tercatat di kartu stok.

Stack: **Next.js 16 (App Router, Server Actions)** · **Supabase (Postgres, Auth, RLS)** · **Tailwind CSS 4** · deploy ke **Vercel**.

---

## Fitur

| Modul | Isi |
| --- | --- |
| **Dashboard** | Order aktif, produk yang perlu diproduksi, material kurang + saran PO, piutang & jatuh tempo, penjualan bulan ini, stok di bawah minimum |
| **Order Masuk** | Input order customer (Draft / Konfirmasi), no. PO customer, due date. Detail order menampilkan **kebutuhan material untuk order itu**, tombol buat Work Order, pengiriman (Surat Jalan) & invoice yang terkait |
| **MRP** | Kebutuhan produksi FG (sudah dikurangi stok FG & WO berjalan, dialokasikan ke order dengan due date terdekat), **explode BOM** ke material, netting terhadap stok + PO berjalan + safety stock, **saran PO** (dibulatkan ke MOQ & kelipatan beli), tanggal pesan paling lambat (due date − lead time), rincian per order (pegging). Satu klik → **buat WO** atau **buat PO draft per supplier** |
| **BOM / Resep** | Single-level: 1 barang jadi → n bahan baku/kemasan per *qty output per batch*, scrap %, estimasi HPP |
| **Work Order** | Dibuat dari order / MRP / manual. Kebutuhan material di-*snapshot* dari BOM. Saat selesai: input qty hasil & pemakaian aktual → material dipotong (backflush), stok FG bertambah, HPP FG terupdate |
| **Purchase Order** | Draft → Dipesan → Terima barang (bisa sebagian) → stok bertambah & harga beli terakhir terupdate |
| **Invoice** | Tanpa SO; bisa dibuat bebas atau dari order. Diskon per baris & total, **DPP + PPN (default 11%, bisa diubah)**, termin, pembayaran bertahap, void, **PDF** (dengan terbilang, info bank, cap LUNAS/VOID) |
| **Stok** | Stok FG & material, nilai stok, proyeksi, item di bawah minimum, **kartu stok** (ledger) dengan saldo berjalan, penyesuaian / stock opname |
| **Master** | Produk & material (FG/RM/PKG, satuan, harga, min stock, MOQ, kelipatan, lead time, supplier utama), Customer, Supplier, Pengaturan perusahaan |

### Alur kerja

```
Order Masuk ──(konfirmasi)──► MRP ──► Buat WO ──► Selesaikan WO ──► Stok FG ▲ / Material ▼
                               │
                               └──► Saran PO ──► PO (Draft → Dipesan) ──► Terima ──► Stok Material ▲

Order ──► Kirim (Surat Jalan) ──► Stok FG ▼ ──► Buat Invoice ──► Terbitkan ──► Pembayaran ──► Lunas
Invoice langsung (tanpa order) ──► Terbitkan ──► Stok ▼ (opsional)
```

### Rumus MRP

```
Produksi FG     = Σ sisa order − stok FG − WO berjalan (+ safety stock FG)
Kebutuhan mat.  = Produksi FG ÷ output BOM × qty material × (1 + scrap%)
Kurang          = (Kebutuhan order + sisa kebutuhan WO berjalan + safety stock)
                  − (stok on hand + PO belum diterima)
Saran PO        = max(Kurang, MOQ) dibulatkan ke atas ke kelipatan beli
Pesan paling lambat = due date order terdekat − lead time (item, atau supplier)
```

Opsi di halaman MRP: kurangi/abaikan stok FG, hitung safety stock, sertakan order DRAFT (simulasi "what-if" sebelum order dikonfirmasi).

---

## Setup

### 1. Supabase

1. Buat project di [supabase.com](https://supabase.com).
2. Jalankan migrasi (pilih salah satu):
   - **Supabase CLI**: `npx supabase link --project-ref <ref>` lalu `npx supabase db push`
   - **SQL Editor**: jalankan berurutan file di `supabase/migrations/`
3. (Opsional) Data contoh: jalankan `supabase/seed.sql` di SQL Editor.
4. **Authentication → Sign In / Providers**: matikan *Allow new users to sign up*, lalu buat user tim lewat **Authentication → Users → Add user**. Semua user yang login punya akses penuh (RLS menolak akses anonim).

### 2. Lokal

```bash
cp .env.example .env.local    # isi URL & publishable key dari Project Settings → API
npm install
npm run dev                   # http://localhost:3000
```

Atau pakai Supabase lokal (butuh Docker):

```bash
npx supabase start            # migrasi + seed otomatis
npx supabase status           # ambil API URL & publishable key untuk .env.local
```

### 3. Deploy ke Vercel

1. Import repo ini di Vercel (framework: Next.js, tanpa konfigurasi tambahan).
2. Tambahkan environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Di Supabase **Authentication → URL Configuration**, set *Site URL* ke domain Vercel.

---

## Arsitektur

```
src/
  app/
    login/                 halaman login
    (app)/                 semua halaman yang butuh login (layout + sidebar)
      orders/ mrp/ bom/ work-orders/ purchase-orders/ invoices/ inventory/ items/ customers/ suppliers/ settings/
      invoices/[id]/pdf/   route handler PDF (@react-pdf/renderer)
  components/              UI (ui.tsx, app-shell, form dokumen client)
  lib/
    mrp.ts                 mesin MRP (pure function, ada unit test)
    actions/*.ts           Server Actions → memanggil fungsi Postgres via supabase.rpc
    supabase/              client server & refresh sesi (proxy.ts)
  proxy.ts                 redirect ke /login jika belum login
supabase/
  migrations/              skema, view, fungsi transaksi, RLS
  seed.sql                 data contoh
```

Prinsip yang dipakai:

- **Ledger stok** (`stock_movements`): stok = Σ mutasi. Tidak ada kolom stok yang bisa "di-edit", setiap perubahan punya dokumen sumber (PO, WO, Surat Jalan, Invoice, Penyesuaian). Ledger tidak bisa di-update/delete oleh user.
- **Transaksi atomik di database**: posting (terima PO, selesaikan WO, kirim, terbitkan/void invoice, pembayaran, opname) dijalankan sebagai fungsi PL/pgSQL dalam satu transaksi, dengan row lock & validasi stok tidak boleh minus.
- **Status dokumen** (Draft → Final): dokumen final tidak bisa diubah; koreksi lewat void/batal agar jejak audit tetap ada.
- **Penomoran otomatis** per bulan: `ORD/2026/10/0001`, `WO/…`, `PO/…`, `GRN/…`, `SJ/…`, `INV/…`.
- **Snapshot BOM di WO**: perubahan resep tidak mengubah WO yang sedang berjalan.
- **RLS** aktif di semua tabel; fungsi `SECURITY INVOKER`; akses anonim dicabut.

## Script

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Build produksi |
| `npm run lint` | ESLint |
| `npm test` | Unit test (MRP, terbilang) |
