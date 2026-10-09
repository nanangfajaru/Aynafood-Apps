import Link from "next/link";
import { Badge, Card, EmptyRow, LinkButton, PageHeader, StatusBadge, Table, TabLinks, Td, Th } from "@/components/ui";
import { PO_STATUS } from "@/lib/constants";
import { formatDate, formatIDR } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Purchase Order" };

const TABS = {
  OPEN: { label: "Berjalan", statuses: ["ORDERED", "PARTIAL"] },
  DRAFT: { label: "Draft", statuses: ["DRAFT"] },
  RECEIVED: { label: "Diterima", statuses: ["RECEIVED"] },
  CANCELLED: { label: "Batal", statuses: ["CANCELLED"] },
  ALL: { label: "Semua", statuses: null },
} as const;

export default async function PurchaseOrdersPage({ searchParams }: PageProps<"/purchase-orders">) {
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" && sp.tab in TABS ? sp.tab : "OPEN") as keyof typeof TABS;
  const { supabase } = await requireUser();
  let q = supabase.from("v_purchase_orders").select("*").order("order_date", { ascending: false }).order("po_no", { ascending: false }).limit(200);
  const statuses = TABS[tab].statuses;
  if (statuses) q = q.in("status", statuses);
  const { data } = await q;
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Purchase Order"
        description="Pembelian bahan baku & kemasan. PO draft dari saran MRP juga muncul di sini."
        actions={
          <LinkButton href="/purchase-orders/new" variant="primary">
            + PO Baru
          </LinkButton>
        }
      />
      <TabLinks
        active={tab}
        tabs={Object.entries(TABS).map(([k, v]) => ({ key: k, label: v.label, href: `/purchase-orders?tab=${k}` }))}
      />
      <Card bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>No. PO</Th>
              <Th>Tanggal</Th>
              <Th>Supplier</Th>
              <Th>Estimasi Datang</Th>
              <Th className="text-right">Total</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <EmptyRow colSpan={6}>Tidak ada PO</EmptyRow>}
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/purchase-orders/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.po_no}
                  </Link>{" "}
                  {p.source === "MRP" && <Badge tone="violet">MRP</Badge>}
                </Td>
                <Td>{formatDate(p.order_date)}</Td>
                <Td>{p.supplier_name}</Td>
                <Td>{formatDate(p.expected_date)}</Td>
                <Td className="num">{formatIDR(p.total)}</Td>
                <Td>
                  <StatusBadge map={PO_STATUS} status={p.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
