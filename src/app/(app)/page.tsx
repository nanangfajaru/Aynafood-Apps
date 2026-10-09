import Link from "next/link";
import { Badge, Card, EmptyRow, LinkButton, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { ORDER_STATUS } from "@/lib/constants";
import { formatDate, formatIDR, formatQty, todayISO } from "@/lib/format";
import { computeMrp, type MrpOrderLine } from "@/lib/mrp";
import { getActiveBoms, getItemStocks } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const today = todayISO();
  const monthStart = `${today.slice(0, 8)}01`;

  const [stocks, boms, { data: openLines }, { data: orders }, { data: unpaid }, { data: monthInv }, { count: woActive }] =
    await Promise.all([
      getItemStocks(supabase),
      getActiveBoms(supabase),
      supabase.from("v_open_order_lines").select("*").returns<MrpOrderLine[]>(),
      supabase
        .from("v_orders")
        .select("id, order_no, customer_name, due_date, status, total_amount")
        .in("status", ["CONFIRMED", "IN_PRODUCTION", "PARTIAL"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(8),
      supabase.from("v_invoices").select("balance, is_overdue").in("status", ["ISSUED", "PARTIAL"]),
      supabase.from("invoices").select("total").neq("status", "VOID").neq("status", "DRAFT").gte("invoice_date", monthStart),
      supabase.from("work_orders").select("id", { count: "exact", head: true }).in("status", ["PLANNED", "IN_PROGRESS"]),
    ]);

  const mrp = computeMrp(
    stocks.filter((s) => s.is_active || s.on_hand !== 0),
    openLines ?? [],
    boms,
    { includeDraft: false, netFgStock: true, includeSafetyStock: true, today },
  );
  const receivable = (unpaid ?? []).reduce((s, r) => s + Number(r.balance), 0);
  const overdue = (unpaid ?? []).filter((r) => r.is_overdue).reduce((s, r) => s + Number(r.balance), 0);
  const sales = (monthInv ?? []).reduce((s, r) => s + Number(r.total), 0);
  const low = stocks.filter((s) => s.is_active && s.min_stock > 0 && s.on_hand < s.min_stock);
  const shortages = mrp.materials.filter((m) => m.shortage > 0).slice(0, 8);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Ringkasan per ${formatDate(today)}`}
        actions={
          <>
            <LinkButton href="/orders/new" variant="primary">
              + Order Masuk
            </LinkButton>
            <LinkButton href="/invoices/new">+ Invoice</LinkButton>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Order aktif" value={mrp.summary.openOrderCount} hint={`${woActive ?? 0} WO berjalan`} href="/orders" tone="blue" />
        <Stat
          label="Material kurang"
          value={mrp.summary.materialShortageCount}
          hint={mrp.summary.lateCount ? `${mrp.summary.lateCount} harus dipesan segera` : "Lihat saran PO di MRP"}
          href="/mrp"
          tone={mrp.summary.materialShortageCount ? "red" : "green"}
        />
        <Stat label="Piutang" value={formatIDR(receivable)} hint={`Jatuh tempo lewat: ${formatIDR(overdue)}`} href="/invoices" tone={overdue ? "amber" : "gray"} />
        <Stat label="Penjualan bulan ini" value={formatIDR(sales)} hint="Invoice terbit (termasuk PPN)" tone="violet" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Order Aktif" actions={<LinkButton href="/orders" size="sm">Semua</LinkButton>} bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>No.</Th>
                <Th>Customer</Th>
                <Th>Due</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(orders ?? []).length === 0 && <EmptyRow colSpan={4}>Tidak ada order aktif</EmptyRow>}
              {(orders ?? []).map((o) => (
                <tr key={o.id}>
                  <Td>
                    <Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                      {o.order_no}
                    </Link>
                  </Td>
                  <Td>{o.customer_name}</Td>
                  <Td className={`whitespace-nowrap ${o.due_date && o.due_date < today ? "font-semibold text-red-600" : ""}`}>
                    {formatDate(o.due_date)}
                  </Td>
                  <Td>
                    <StatusBadge map={ORDER_STATUS} status={o.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Perlu Diproduksi" actions={<LinkButton href="/mrp" size="sm">MRP</LinkButton>} bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Produk</Th>
                <Th className="text-right">Order</Th>
                <Th className="text-right">Stok</Th>
                <Th className="text-right">Produksi</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mrp.fgPlans.filter((p) => p.netToProduce > 0).length === 0 && (
                <EmptyRow colSpan={4}>Tidak ada yang perlu diproduksi</EmptyRow>
              )}
              {mrp.fgPlans
                .filter((p) => p.netToProduce > 0)
                .slice(0, 8)
                .map((p) => (
                  <tr key={p.item.id}>
                    <Td>
                      {p.item.sku} · {p.item.name}
                    </Td>
                    <Td className="num">{formatQty(p.demand)}</Td>
                    <Td className="num">{formatQty(p.onHand)}</Td>
                    <Td className="num font-semibold text-violet-700">{formatQty(p.netToProduce)}</Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Material Kurang (saran PO)" actions={<LinkButton href="/mrp" size="sm">Buat PO</LinkButton>} bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Material</Th>
                <Th className="text-right">Kurang</Th>
                <Th className="text-right">Saran PO</Th>
                <Th>Pesan s/d</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shortages.length === 0 && <EmptyRow colSpan={4}>Semua material mencukupi</EmptyRow>}
              {shortages.map((m) => (
                <tr key={m.item.id}>
                  <Td>
                    {m.item.sku} · {m.item.name}
                  </Td>
                  <Td className="num text-red-600">
                    {formatQty(m.shortage)} {m.item.unit}
                  </Td>
                  <Td className="num">{formatQty(m.suggestedQty)}</Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(m.orderByDate)} {m.isLate && <Badge tone="red">Telat</Badge>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Stok di Bawah Minimum" actions={<LinkButton href="/inventory?tab=LOW" size="sm">Stok</LinkButton>} bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Stok</Th>
                <Th className="text-right">Min</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {low.length === 0 && <EmptyRow colSpan={3}>Semua stok aman</EmptyRow>}
              {low.slice(0, 8).map((s) => (
                <tr key={s.id}>
                  <Td>
                    {s.sku} · {s.name}
                  </Td>
                  <Td className="num text-red-600">
                    {formatQty(s.on_hand)} {s.unit}
                  </Td>
                  <Td className="num">{formatQty(s.min_stock)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
