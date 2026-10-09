import Link from "next/link";
import { Badge, Card, EmptyRow, Input, LinkButton, PageHeader, StatusBadge, Table, TabLinks, Td, Th } from "@/components/ui";
import { INVOICE_STATUS } from "@/lib/constants";
import { formatDate, formatIDR, searchTerm } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Invoice" };

const TABS = {
  UNPAID: { label: "Belum Lunas", statuses: ["ISSUED", "PARTIAL"] },
  DRAFT: { label: "Draft", statuses: ["DRAFT"] },
  PAID: { label: "Lunas", statuses: ["PAID"] },
  VOID: { label: "Void", statuses: ["VOID"] },
  ALL: { label: "Semua", statuses: null },
} as const;

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" && sp.tab in TABS ? sp.tab : "UNPAID") as keyof typeof TABS;
  const q = searchTerm(sp.q);
  const { supabase } = await requireUser();
  let query = supabase.from("v_invoices").select("*").order("invoice_date", { ascending: false }).order("invoice_no", { ascending: false }).limit(200);
  const statuses = TABS[tab].statuses;
  if (statuses) query = query.in("status", statuses);
  if (q) query = query.or(`invoice_no.ilike.%${q}%,customer_name.ilike.%${q}%`);
  const { data } = await query;
  const rows = data ?? [];
  const totalBalance = rows.reduce((s, r) => s + (r.status === "VOID" || r.status === "DRAFT" ? 0 : Number(r.balance)), 0);

  return (
    <>
      <PageHeader
        title="Invoice"
        description="Tagihan ke customer (PPN, diskon, pembayaran bertahap, PDF)."
        actions={
          <LinkButton href="/invoices/new" variant="primary">
            + Invoice Baru
          </LinkButton>
        }
      />
      <TabLinks
        active={tab}
        tabs={Object.entries(TABS).map(([k, v]) => ({ key: k, label: v.label, href: `/invoices?tab=${k}` }))}
      />
      <Card bodyClassName="p-0">
        <form className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
          <input type="hidden" name="tab" value={tab} />
          <Input name="q" defaultValue={q} placeholder="Cari no. invoice atau customer…" className="max-w-xs" />
          <span className="text-sm text-slate-600">
            Sisa tagihan: <b>{formatIDR(totalBalance)}</b>
          </span>
        </form>
        <Table>
          <thead>
            <tr>
              <Th>No. Invoice</Th>
              <Th>Tanggal</Th>
              <Th>Customer</Th>
              <Th>Jatuh Tempo</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Sisa</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <EmptyRow colSpan={7}>Tidak ada invoice</EmptyRow>}
            {rows.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/invoices/${inv.id}`} className="font-medium text-brand-700 hover:underline">
                    {inv.invoice_no}
                  </Link>
                  {inv.order_no && <div className="text-xs text-slate-500">{inv.order_no}</div>}
                </Td>
                <Td>{formatDate(inv.invoice_date)}</Td>
                <Td>{inv.customer_name}</Td>
                <Td className={inv.is_overdue ? "font-semibold text-red-600" : ""}>
                  {formatDate(inv.due_date)} {inv.is_overdue && <Badge tone="red">Lewat</Badge>}
                </Td>
                <Td className="num">{formatIDR(inv.total)}</Td>
                <Td className="num">{inv.status === "VOID" ? "-" : formatIDR(inv.balance)}</Td>
                <Td>
                  <StatusBadge map={INVOICE_STATUS} status={inv.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
