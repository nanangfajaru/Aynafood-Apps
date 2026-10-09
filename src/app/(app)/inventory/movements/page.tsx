import Link from "next/link";
import { Card, EmptyRow, Input, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { MOVEMENT_TYPES } from "@/lib/constants";
import { formatDate, formatIDR, formatQty } from "@/lib/format";
import { getItemOptions } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Kartu Stok" };

const REF_LINK: Record<string, (id: string) => string> = {
  WORK_ORDER: (id) => `/work-orders/${id}`,
  INVOICE: (id) => `/invoices/${id}`,
};

type Movement = {
  id: number;
  item_id: string;
  item_sku: string;
  item_name: string;
  item_unit: string;
  movement_date: string;
  movement_type: string;
  qty: number;
  unit_cost: number | null;
  ref_type: string | null;
  ref_id: string | null;
  ref_no: string | null;
  notes: string | null;
};

export default async function MovementsPage({ searchParams }: PageProps<"/inventory/movements">) {
  const sp = await searchParams;
  const itemId = typeof sp.item === "string" && sp.item ? sp.item : null;
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const { supabase } = await requireUser();

  let q = supabase.from("v_stock_movements").select("*").order("movement_date", { ascending: false }).order("id", { ascending: false }).limit(500);
  if (itemId) q = q.eq("item_id", itemId);
  if (from) q = q.gte("movement_date", from);
  if (to) q = q.lte("movement_date", to);
  const [{ data }, items] = await Promise.all([q.returns<Movement[]>(), getItemOptions(supabase)]);
  const rows = data ?? [];

  // saldo berjalan (hanya jika 1 item dipilih & tanpa filter tanggal awal)
  let running: Map<number, number> | null = null;
  if (itemId && !from) {
    running = new Map();
    let bal = 0;
    for (const m of [...rows].reverse()) {
      bal += m.qty;
      running.set(m.id, bal);
    }
  }

  return (
    <>
      <PageHeader
        title="Kartu Stok"
        description="Riwayat semua mutasi stok (masuk/keluar) beserta dokumen sumbernya."
        actions={<LinkButton href="/inventory">← Stok</LinkButton>}
      />
      <Card bodyClassName="p-0">
        <form className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">Item</span>
            <Select name="item" defaultValue={itemId ?? ""} className="w-72">
              <option value="">Semua item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.sku} · {i.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">Dari</span>
            <Input type="date" name="from" defaultValue={from} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">Sampai</span>
            <Input type="date" name="to" defaultValue={to} />
          </label>
          <button className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">Filter</button>
        </form>
        <Table>
          <thead>
            <tr>
              <Th>Tanggal</Th>
              <Th>Item</Th>
              <Th>Jenis</Th>
              <Th>Dokumen</Th>
              <Th className="text-right">Masuk</Th>
              <Th className="text-right">Keluar</Th>
              {running && <Th className="text-right">Saldo</Th>}
              <Th className="text-right">Harga</Th>
              <Th>Catatan</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <EmptyRow colSpan={9}>Belum ada mutasi</EmptyRow>}
            {rows.map((m) => {
              const link = m.ref_type && m.ref_id ? REF_LINK[m.ref_type]?.(m.ref_id) : undefined;
              return (
                <tr key={m.id}>
                  <Td>{formatDate(m.movement_date)}</Td>
                  <Td>
                    {m.item_sku} · {m.item_name}
                  </Td>
                  <Td>{MOVEMENT_TYPES[m.movement_type] ?? m.movement_type}</Td>
                  <Td>
                    {link ? (
                      <Link href={link} className="text-brand-700 hover:underline">
                        {m.ref_no}
                      </Link>
                    ) : (
                      (m.ref_no ?? "-")
                    )}
                  </Td>
                  <Td className="num text-emerald-700">{m.qty > 0 ? formatQty(m.qty) : ""}</Td>
                  <Td className="num text-red-600">{m.qty < 0 ? formatQty(-m.qty) : ""}</Td>
                  {running && <Td className="num font-medium">{formatQty(running.get(m.id) ?? 0)}</Td>}
                  <Td className="num">{m.unit_cost != null ? formatIDR(m.unit_cost) : "-"}</Td>
                  <Td className="text-xs text-slate-500">{m.notes}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
