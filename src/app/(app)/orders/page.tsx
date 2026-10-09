import Link from "next/link";
import { Card, EmptyRow, Input, LinkButton, PageHeader, StatusBadge, Table, TabLinks, Td, Th } from "@/components/ui";
import { ORDER_STATUS } from "@/lib/constants";
import { formatDate, formatIDR, formatQty, searchTerm, todayISO } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Order Masuk" };

const TABS = {
  ACTIVE: { label: "Aktif", statuses: ["CONFIRMED", "IN_PRODUCTION", "PARTIAL"] },
  DRAFT: { label: "Draft", statuses: ["DRAFT"] },
  DONE: { label: "Selesai", statuses: ["DELIVERED"] },
  CANCELLED: { label: "Batal", statuses: ["CANCELLED"] },
  ALL: { label: "Semua", statuses: null },
} as const;

type OrderRow = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_po: string | null;
  order_date: string;
  due_date: string | null;
  status: string;
  total_amount: number;
  total_qty: number;
  delivered_qty: number;
  wo_count: number;
  invoice_count: number;
};

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" && sp.tab in TABS ? sp.tab : "ACTIVE") as keyof typeof TABS;
  const q = searchTerm(sp.q);
  const { supabase } = await requireUser();

  let query = supabase.from("v_orders").select("*").order("order_date", { ascending: false }).order("order_no", { ascending: false }).limit(200);
  const statuses = TABS[tab].statuses;
  if (statuses) query = query.in("status", statuses);
  if (q) query = query.or(`order_no.ilike.%${q}%,customer_name.ilike.%${q}%,customer_po.ilike.%${q}%`);
  const { data } = await query.returns<OrderRow[]>();
  const rows = data ?? [];
  const today = todayISO();

  return (
    <>
      <PageHeader
        title="Order Masuk"
        description="Pesanan customer. Order yang dikonfirmasi otomatis masuk perhitungan MRP."
        actions={
          <LinkButton href="/orders/new" variant="primary">
            + Order Baru
          </LinkButton>
        }
      />
      <TabLinks
        active={tab}
        tabs={Object.entries(TABS).map(([k, v]) => ({ key: k, label: v.label, href: `/orders?tab=${k}` }))}
      />
      <Card bodyClassName="p-0">
        <form className="border-b border-slate-200 p-3">
          <input type="hidden" name="tab" value={tab} />
          <Input name="q" defaultValue={q} placeholder="Cari no. order, customer, no. PO…" className="max-w-xs" />
        </form>
        <Table>
          <thead>
            <tr>
              <Th>No. Order</Th>
              <Th>Tanggal</Th>
              <Th>Customer</Th>
              <Th>Due Date</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Terkirim</Th>
              <Th>WO / Inv</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <EmptyRow colSpan={8}>Tidak ada order</EmptyRow>}
            {rows.map((o) => {
              const late =
                o.due_date && o.due_date < today && ["CONFIRMED", "IN_PRODUCTION", "PARTIAL"].includes(o.status);
              return (
                <tr key={o.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                      {o.order_no}
                    </Link>
                    {o.customer_po && <div className="text-xs text-slate-500">PO: {o.customer_po}</div>}
                  </Td>
                  <Td>{formatDate(o.order_date)}</Td>
                  <Td>{o.customer_name}</Td>
                  <Td className={late ? "font-semibold text-red-600" : ""}>{formatDate(o.due_date)}</Td>
                  <Td className="num">{formatIDR(o.total_amount)}</Td>
                  <Td className="num">
                    {formatQty(o.delivered_qty)} / {formatQty(o.total_qty)}
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {o.wo_count} WO · {o.invoice_count} Inv
                  </Td>
                  <Td>
                    <StatusBadge map={ORDER_STATUS} status={o.status} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
