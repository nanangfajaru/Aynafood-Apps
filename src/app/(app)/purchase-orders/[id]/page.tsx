import { notFound } from "next/navigation";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, DescList, Field, Input, LinkButton, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import {
  deletePurchaseOrder,
  receivePurchaseOrder,
  setPurchaseOrderStatus,
} from "@/lib/actions/purchasing";
import { PO_STATUS } from "@/lib/constants";
import { formatDate, formatIDR, formatQty, todayISO } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

type PoLine = {
  id: string;
  item_id: string;
  qty: number;
  unit_price: number;
  qty_received: number;
  notes: string | null;
  sort: number;
  item: { sku: string; name: string; unit: string };
};

type Receipt = {
  id: string;
  gr_no: string;
  receipt_date: string;
  notes: string | null;
  goods_receipt_lines: { qty: number; item: { sku: string; unit: string } }[];
};

export default async function PoDetailPage({ params }: PageProps<"/purchase-orders/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: po }, { data: lineData }, { data: receipts }] = await Promise.all([
    supabase.from("v_purchase_orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("po_lines").select("*, item:items(sku, name, unit)").eq("po_id", id).order("sort").returns<PoLine[]>(),
    supabase
      .from("goods_receipts")
      .select("id, gr_no, receipt_date, notes, goods_receipt_lines(qty, item:items(sku, unit))")
      .eq("po_id", id)
      .order("created_at")
      .returns<Receipt[]>(),
  ]);
  if (!po) notFound();
  const lines = lineData ?? [];
  const canReceive = po.status === "ORDERED" || po.status === "PARTIAL";
  const hasReceipt = lines.some((l) => l.qty_received > 0);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {po.po_no} <StatusBadge map={PO_STATUS} status={po.status} />
            {po.source === "MRP" && <Badge tone="violet">Dari MRP</Badge>}
          </span>
        }
        back={{ href: "/purchase-orders", label: "Purchase Order" }}
        actions={
          <>
            {po.status === "DRAFT" && (
              <>
                <LinkButton href={`/purchase-orders/${id}/edit`}>Ubah</LinkButton>
                <ActionButton action={setPurchaseOrderStatus.bind(null, id, "ORDERED")} variant="primary">
                  Tandai Sudah Dipesan
                </ActionButton>
              </>
            )}
            {po.status === "ORDERED" && !hasReceipt && (
              <ActionButton action={setPurchaseOrderStatus.bind(null, id, "DRAFT")}>Kembalikan ke Draft</ActionButton>
            )}
            {po.status === "PARTIAL" && (
              <ActionButton
                action={setPurchaseOrderStatus.bind(null, id, "RECEIVED")}
                confirmText="Tutup PO? Sisa qty tidak akan diterima lagi."
              >
                Tutup PO
              </ActionButton>
            )}
            {(po.status === "DRAFT" || (po.status === "ORDERED" && !hasReceipt)) && (
              <ActionButton
                action={setPurchaseOrderStatus.bind(null, id, "CANCELLED")}
                confirmText="Batalkan PO ini?"
                variant="danger"
              >
                Batalkan
              </ActionButton>
            )}
            {po.status === "DRAFT" && (
              <ActionButton action={deletePurchaseOrder.bind(null, id)} confirmText="Hapus PO ini?" variant="danger">
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
              { label: "Supplier", value: po.supplier_name },
              { label: "Tanggal PO", value: formatDate(po.order_date) },
              { label: "Estimasi Datang", value: formatDate(po.expected_date) },
              { label: "Subtotal", value: formatIDR(po.subtotal) },
              { label: `PPN ${po.tax_rate}%`, value: formatIDR(po.tax_amount) },
              { label: "Total", value: <b>{formatIDR(po.total)}</b> },
            ]}
          />
          {po.notes && <p className="mt-4 whitespace-pre-line text-sm text-slate-600">{po.notes}</p>}
        </Card>

        <Card title="Item" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Diterima</Th>
                <Th className="text-right">Sisa</Th>
                <Th className="text-right">Harga</Th>
                <Th className="text-right">Subtotal</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td>
                    {l.item.sku} · {l.item.name}
                    {l.notes && <div className="text-xs text-slate-500">{l.notes}</div>}
                  </Td>
                  <Td className="num">
                    {formatQty(l.qty)} {l.item.unit}
                  </Td>
                  <Td className="num">{formatQty(l.qty_received)}</Td>
                  <Td className="num">{formatQty(Math.max(l.qty - l.qty_received, 0))}</Td>
                  <Td className="num">{formatIDR(l.unit_price)}</Td>
                  <Td className="num">{formatIDR(l.qty * l.unit_price)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {canReceive && (
          <Card title="Terima Barang">
            <ActionForm
              action={receivePurchaseOrder.bind(null, id)}
              confirmText="Simpan penerimaan? Stok akan bertambah."
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {lines
                  .filter((l) => l.qty > l.qty_received)
                  .map((l) => (
                    <Field
                      key={l.id}
                      label={`${l.item.sku} · ${l.item.name} (${l.item.unit})`}
                      hint={`Sisa ${formatQty(l.qty - l.qty_received)}`}
                    >
                      <Input
                        name={`rcv_${l.id}`}
                        type="number"
                        step="any"
                        min={0}
                        max={l.qty - l.qty_received}
                        defaultValue={l.qty - l.qty_received}
                      />
                    </Field>
                  ))}
                <Field label="Tanggal terima">
                  <Input name="date" type="date" defaultValue={todayISO()} />
                </Field>
                <Field label="Catatan (no. surat jalan supplier, dll.)" className="md:col-span-2">
                  <Input name="notes" />
                </Field>
              </div>
              <SubmitButton variant="success">Simpan Penerimaan</SubmitButton>
            </ActionForm>
          </Card>
        )}
        {po.status === "DRAFT" && (
          <p className="text-sm text-slate-500">
            Kirim PO ke supplier lalu klik “Tandai Sudah Dipesan” untuk bisa menerima barang.
          </p>
        )}

        {(receipts ?? []).length > 0 && (
          <Card title="Riwayat Penerimaan">
            <ul className="divide-y divide-slate-100 text-sm">
              {(receipts ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium">{r.gr_no}</span>
                  <span className="text-slate-500">{formatDate(r.receipt_date)}</span>
                  <span className="text-slate-600">
                    {r.goods_receipt_lines.map((g) => `${g.item.sku}: ${formatQty(g.qty)} ${g.item.unit}`).join(", ")}
                  </span>
                  {r.notes && <span className="w-full text-xs text-slate-500">{r.notes}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
