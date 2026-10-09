import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, DescList, Field, Input, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { completeWorkOrder, setWorkOrderStatus } from "@/lib/actions/production";
import { WO_STATUS } from "@/lib/constants";
import { formatDate, formatIDR, formatQty, todayISO } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

type MaterialRow = {
  id: string;
  item_id: string;
  qty_required: number;
  qty_consumed: number;
  item: { sku: string; name: string; unit: string; cost_price: number };
};

export default async function WorkOrderPage({ params }: PageProps<"/work-orders/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: wo }, { data: mats }] = await Promise.all([
    supabase.from("v_work_orders").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("work_order_materials")
      .select("id, item_id, qty_required, qty_consumed, item:items(sku, name, unit, cost_price)")
      .eq("wo_id", id)
      .returns<MaterialRow[]>(),
  ]);
  if (!wo) notFound();
  const materials = (mats ?? []).sort((a, b) => a.item.sku.localeCompare(b.item.sku));

  const { data: stocks } = await supabase
    .from("v_item_stock")
    .select("id, on_hand")
    .in("id", materials.map((m) => m.item_id));
  const onHand = new Map((stocks ?? []).map((s) => [s.id, Number(s.on_hand)]));

  const open = wo.status === "PLANNED" || wo.status === "IN_PROGRESS";
  const shortages = materials.filter((m) => (onHand.get(m.item_id) ?? 0) < m.qty_required);
  const materialCost = materials.reduce(
    (s, m) => s + (wo.status === "COMPLETED" ? m.qty_consumed : m.qty_required) * m.item.cost_price,
    0,
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {wo.wo_no} <StatusBadge map={WO_STATUS} status={wo.status} />
          </span>
        }
        back={{ href: "/work-orders", label: "Work Order" }}
        actions={
          <>
            {wo.status === "PLANNED" && (
              <ActionButton action={setWorkOrderStatus.bind(null, id, "IN_PROGRESS")} variant="primary">
                Mulai Produksi
              </ActionButton>
            )}
            {open && (
              <ActionButton
                action={setWorkOrderStatus.bind(null, id, "CANCELLED")}
                confirmText="Batalkan work order ini?"
                variant="danger"
              >
                Batalkan
              </ActionButton>
            )}
          </>
        }
      />

      <div className="space-y-6">
        <Card>
          <DescList
            items={[
              { label: "Produk", value: `${wo.item_sku} · ${wo.item_name}` },
              { label: "Qty Rencana", value: `${formatQty(wo.qty_planned)} ${wo.item_unit}` },
              {
                label: "Qty Hasil",
                value: wo.status === "COMPLETED" ? `${formatQty(wo.qty_produced)} ${wo.item_unit}` : "-",
              },
              { label: "Tanggal Rencana", value: formatDate(wo.planned_date) },
              {
                label: "Order",
                value: wo.order_id ? (
                  <Link href={`/orders/${wo.order_id}`} className="text-brand-700 hover:underline">
                    {wo.order_no}
                  </Link>
                ) : (
                  "Produksi stok"
                ),
              },
              { label: "BOM", value: wo.bom_code },
              { label: "Biaya Material", value: formatIDR(materialCost) },
              {
                label: "HPP / unit",
                value: formatIDR(materialCost / (wo.status === "COMPLETED" ? wo.qty_produced : wo.qty_planned)),
              },
            ]}
          />
          {wo.notes && <p className="mt-4 whitespace-pre-line text-sm text-slate-600">{wo.notes}</p>}
        </Card>

        <Card title="Kebutuhan Material" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Material</Th>
                <Th className="text-right">Dibutuhkan</Th>
                <Th className="text-right">Stok Saat Ini</Th>
                <Th className="text-right">Terpakai</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {materials.map((m) => {
                const stock = onHand.get(m.item_id) ?? 0;
                return (
                  <tr key={m.id}>
                    <Td>
                      {m.item.sku} · {m.item.name}
                    </Td>
                    <Td className="num">
                      {formatQty(m.qty_required)} {m.item.unit}
                    </Td>
                    <Td className={`num ${open && stock < m.qty_required ? "font-semibold text-red-600" : ""}`}>
                      {formatQty(stock)}
                    </Td>
                    <Td className="num">{wo.status === "COMPLETED" ? formatQty(m.qty_consumed) : "-"}</Td>
                    <Td>
                      {wo.status === "COMPLETED" ? (
                        <Badge tone="green">Terpakai</Badge>
                      ) : stock >= m.qty_required ? (
                        <Badge tone="green">Siap</Badge>
                      ) : (
                        <Badge tone="red">Kurang {formatQty(m.qty_required - stock)}</Badge>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        {open && (
          <Card title="Selesaikan Produksi">
            {shortages.length > 0 && (
              <p className="mb-3 text-sm text-red-600">
                {shortages.length} material stoknya belum cukup. Terima PO / sesuaikan stok terlebih dahulu, atau ubah qty
                pemakaian aktual.
              </p>
            )}
            <ActionForm
              action={completeWorkOrder.bind(null, id)}
              confirmText="Selesaikan produksi? Stok material akan dipotong dan stok barang jadi bertambah."
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label={`Qty hasil produksi (${wo.item_unit}) *`} hint="Qty barang jadi yang lolos QC">
                  <Input name="qty_produced" type="number" step="any" min={0} defaultValue={wo.qty_planned} required />
                </Field>
                <Field label="Tanggal selesai">
                  <Input name="date" type="date" defaultValue={todayISO()} />
                </Field>
                <Field label="Catatan">
                  <Input name="notes" />
                </Field>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Pemakaian material aktual</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {materials.map((m) => (
                    <Field key={m.id} label={`${m.item.sku} · ${m.item.name} (${m.item.unit})`}>
                      <Input name={`mat_${m.item_id}`} type="number" step="any" min={0} defaultValue={m.qty_required} />
                    </Field>
                  ))}
                </div>
              </div>
              <SubmitButton variant="success">Selesaikan & Posting Stok</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
