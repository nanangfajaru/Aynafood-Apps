import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, DescList, Field, Input, LinkButton, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import {
  addPayment,
  deleteInvoice,
  deletePayment,
  issueInvoice,
  voidInvoice,
} from "@/lib/actions/invoices";
import { INVOICE_STATUS, PAYMENT_METHODS } from "@/lib/constants";
import { formatDate, formatIDR, formatQty, terbilang, todayISO } from "@/lib/format";
import { getInvoiceFull } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export default async function InvoiceDetailPage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const data = await getInvoiceFull(supabase, id);
  if (!data) notFound();
  const { invoice: inv, customer, lines, payments } = data;
  const canPay = inv.status === "ISSUED" || inv.status === "PARTIAL";

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {inv.invoice_no} <StatusBadge map={INVOICE_STATUS} status={inv.status} />
            {inv.is_overdue && <Badge tone="red">Jatuh tempo lewat</Badge>}
          </span>
        }
        back={{ href: "/invoices", label: "Invoice" }}
        actions={
          <>
            {inv.status === "DRAFT" && (
              <>
                <LinkButton href={`/invoices/${id}/edit`}>Ubah</LinkButton>
                <ActionButton
                  action={issueInvoice.bind(null, id)}
                  confirmText={
                    inv.deduct_stock
                      ? "Terbitkan invoice? Stok barang akan dikurangi dan invoice tidak bisa diubah lagi."
                      : "Terbitkan invoice? Invoice tidak bisa diubah lagi."
                  }
                  variant="primary"
                >
                  Terbitkan
                </ActionButton>
              </>
            )}
            <a href={`/invoices/${id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex">
              <span className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                ⬇ PDF
              </span>
            </a>
            {inv.status === "DRAFT" && (
              <ActionButton action={deleteInvoice.bind(null, id)} confirmText="Hapus invoice draft ini?" variant="danger">
                Hapus
              </ActionButton>
            )}
          </>
        }
      />

      <div className="space-y-6">
        <Card>
          <DescList
            items={[
              { label: "Customer", value: `${customer.code} · ${customer.name}` },
              { label: "Tanggal", value: formatDate(inv.invoice_date) },
              { label: "Jatuh Tempo", value: formatDate(inv.due_date) },
              {
                label: "Order",
                value: inv.order_id ? (
                  <Link href={`/orders/${inv.order_id}`} className="text-brand-700 hover:underline">
                    {inv.order_no}
                  </Link>
                ) : (
                  "-"
                ),
              },
              { label: "Kurangi stok", value: inv.deduct_stock ? "Ya (penjualan langsung)" : "Tidak" },
              { label: "Sisa tagihan", value: <b>{inv.status === "VOID" ? "-" : formatIDR(inv.balance)}</b> },
            ]}
          />
        </Card>

        <Card bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Deskripsi</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Harga</Th>
                <Th className="text-right">Disc</Th>
                <Th className="text-right">Jumlah</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, i) => (
                <tr key={l.id}>
                  <Td>{i + 1}</Td>
                  <Td>{l.description}</Td>
                  <Td className="num">
                    {formatQty(l.qty)} {l.unit}
                  </Td>
                  <Td className="num">{formatIDR(l.unit_price)}</Td>
                  <Td className="num">{l.discount_pct ? `${formatQty(l.discount_pct)}%` : "-"}</Td>
                  <Td className="num">{formatIDR(l.line_total)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex flex-col items-end gap-1 border-t border-slate-200 px-4 py-3 text-sm">
            <Row label="Subtotal" value={formatIDR(inv.subtotal)} />
            {inv.discount_amount > 0 && <Row label="Diskon" value={`- ${formatIDR(inv.discount_amount)}`} />}
            <Row label="DPP" value={formatIDR(inv.dpp)} />
            <Row label={`PPN ${formatQty(inv.tax_rate)}%`} value={formatIDR(inv.tax_amount)} />
            <Row label="Total" value={<b className="text-base">{formatIDR(inv.total)}</b>} />
            {inv.amount_paid > 0 && <Row label="Dibayar" value={`- ${formatIDR(inv.amount_paid)}`} />}
            <p className="mt-1 text-xs italic text-slate-500">Terbilang: {terbilang(inv.total)}</p>
          </div>
          {inv.notes && <p className="whitespace-pre-line border-t border-slate-200 px-4 py-3 text-sm text-slate-600">{inv.notes}</p>}
        </Card>

        {inv.status !== "DRAFT" && (
          <Card title="Pembayaran">
            {payments.length > 0 && (
              <ul className="mb-4 divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>{formatDate(p.payment_date)}</span>
                    <span className="text-slate-500">
                      {p.method}
                      {p.reference && ` · ${p.reference}`}
                    </span>
                    <span className="num font-medium">{formatIDR(p.amount)}</span>
                    {inv.status !== "VOID" && (
                      <ActionButton
                        action={deletePayment.bind(null, p.id, id)}
                        confirmText="Hapus pembayaran ini?"
                        variant="ghost"
                        size="sm"
                      >
                        Hapus
                      </ActionButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canPay && (
              <ActionForm action={addPayment.bind(null, id)} className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
                <Field label="Jumlah *">
                  <Input name="amount" type="number" step="any" min={0} defaultValue={inv.balance} required />
                </Field>
                <Field label="Tanggal">
                  <Input name="date" type="date" defaultValue={todayISO()} />
                </Field>
                <Field label="Metode">
                  <Select name="method" defaultValue="TRANSFER">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Referensi">
                  <Input name="reference" placeholder="No. bukti transfer" />
                </Field>
                <SubmitButton variant="success">Catat Pembayaran</SubmitButton>
              </ActionForm>
            )}
            {inv.status === "PAID" && <p className="text-sm text-emerald-700">Invoice sudah lunas.</p>}
          </Card>
        )}

        {inv.status !== "DRAFT" && inv.status !== "VOID" && inv.amount_paid === 0 && (
          <Card title="Void Invoice">
            <ActionForm
              action={voidInvoice.bind(null, id)}
              confirmText="Void invoice ini? Stok yang dikurangi akan dikembalikan."
              className="flex flex-wrap items-end gap-3"
            >
              <Field label="Alasan" className="min-w-64 flex-1">
                <Input name="reason" placeholder="Salah input, dibatalkan customer, …" />
              </Field>
              <SubmitButton variant="danger">Void</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex w-72 justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
