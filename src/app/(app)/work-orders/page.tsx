import Link from "next/link";
import { Card, EmptyRow, LinkButton, PageHeader, StatusBadge, Table, TabLinks, Td, Th } from "@/components/ui";
import { WO_STATUS } from "@/lib/constants";
import { formatDate, formatQty } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Work Order" };

const TABS = {
  ACTIVE: { label: "Aktif", statuses: ["PLANNED", "IN_PROGRESS"] },
  COMPLETED: { label: "Selesai", statuses: ["COMPLETED"] },
  CANCELLED: { label: "Batal", statuses: ["CANCELLED"] },
  ALL: { label: "Semua", statuses: null },
} as const;

export default async function WorkOrdersPage({ searchParams }: PageProps<"/work-orders">) {
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" && sp.tab in TABS ? sp.tab : "ACTIVE") as keyof typeof TABS;
  const { supabase } = await requireUser();
  let q = supabase.from("v_work_orders").select("*").order("planned_date", { ascending: tab === "ACTIVE" }).limit(200);
  const statuses = TABS[tab].statuses;
  if (statuses) q = q.in("status", statuses);
  const { data } = await q;
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Work Order"
        description="Perintah produksi. Saat diselesaikan, material dipotong sesuai BOM dan stok barang jadi bertambah."
        actions={
          <LinkButton href="/work-orders/new" variant="primary">
            + WO Baru
          </LinkButton>
        }
      />
      <TabLinks
        active={tab}
        tabs={Object.entries(TABS).map(([k, v]) => ({ key: k, label: v.label, href: `/work-orders?tab=${k}` }))}
      />
      <Card bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>No. WO</Th>
              <Th>Tanggal</Th>
              <Th>Produk</Th>
              <Th className="text-right">Rencana</Th>
              <Th className="text-right">Hasil</Th>
              <Th>Order</Th>
              <Th>BOM</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <EmptyRow colSpan={8}>Tidak ada work order</EmptyRow>}
            {rows.map((w) => (
              <tr key={w.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/work-orders/${w.id}`} className="font-medium text-brand-700 hover:underline">
                    {w.wo_no}
                  </Link>
                </Td>
                <Td>{formatDate(w.planned_date)}</Td>
                <Td>
                  {w.item_sku} · {w.item_name}
                </Td>
                <Td className="num">
                  {formatQty(w.qty_planned)} {w.item_unit}
                </Td>
                <Td className="num">{w.status === "COMPLETED" ? formatQty(w.qty_produced) : "-"}</Td>
                <Td>
                  {w.order_id ? (
                    <Link href={`/orders/${w.order_id}`} className="text-brand-700 hover:underline">
                      {w.order_no}
                    </Link>
                  ) : (
                    <span className="text-slate-400">Stok</span>
                  )}
                </Td>
                <Td className="text-xs text-slate-500">{w.bom_code}</Td>
                <Td>
                  <StatusBadge map={WO_STATUS} status={w.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
