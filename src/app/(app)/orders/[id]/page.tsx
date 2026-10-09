import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import {
  Alert,
  Badge,
  Card,
  DescList,
  EmptyRow,
  Field,
  Input,
  LinkButton,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@/components/ui";
import {
  createWorkOrdersForOrder,
  deleteOrder,
  deliverOrder,
  setOrderStatus,
} from "@/lib/actions/orders";
import { INVOICE_STATUS, ORDER_STATUS, WO_STATUS } from "@/lib/constants";
import { formatDate, formatIDR, formatQty, todayISO } from "@/lib/format";
import { orderMaterialNeeds } from "@/lib/mrp";
import { getActiveBoms, getItemStocks } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

type Line = {
  id: string;
  item_id: string;
  qty: number;
  unit_price: number;
  qty_delivered: number;
  notes: string | null;
  sort: number;
  item: { sku: string; name: string; unit: string };
};

type DeliveryRow = {
  id: string;
  delivery_no: string;
  delivery_date: string;
  notes: string | null;
  delivery_lines: { qty: number; item: { sku: string; unit: string } }[];
};

export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const [{ data: order }, { data: lineData }, { data: wos }, { data: deliveries }, { data: invoices }, stocks, boms] =
    await Promise.all([
      supabase.from("v_orders").select("*").eq("id", id).maybeSingle(),
      supabase.from("order_lines").select("*, item:items(sku, name, unit)").eq("order_id", id).order("sort"),
      supabase.from("v_work_orders").select("*").eq("order_id", id).order("created_at"),
      supabase
        .from("deliveries")
        .select("id, delivery_no, delivery_date, notes, delivery_lines(qty, item:items(sku, unit))")
        .eq("order_id", id)
        .order("created_at")
        .returns<DeliveryRow[]>(),
      supabase.from("invoices").select("id, invoice_no, invoice_date, status, total").eq("order_id", id).order("created_at"),
      getItemStocks(supabase),
      getActiveBoms(supabase),
    ]);
  if (!order) notFound();

  const lines = (lineData ?? []) as Line[];
  const stockById = new Map(stocks.map((s) => [s.id, s]));
  const active = ["CONFIRMED", "IN_PRODUCTION", "PARTIAL"].includes(order.status);
  const editable =
    ["DRAFT", "CONFIRMED", "IN_PRODUCTION"].includes(order.status) && lines.every((l) => l.qty_delivered === 0);

  // kebutuhan material untuk sisa qty yang belum dikirim
  const remainingLines = lines
    .map((l) => ({ item_id: l.item_id, qty: Math.max(l.qty - l.qty_delivered, 0) }))
    .filter((l) => l.qty > 0);
  const needs = orderMaterialNeeds(remainingLines, boms, stocks);

  // qty yang sudah direncanakan di WO per produk (non-batal)
  const plannedByItem = new Map<string, number>();
  for (const w of wos ?? []) {
    if (w.status === "CANCELLED") continue;
    const q = w.status === "COMPLETED" ? w.qty_produced : w.qty_planned;
    plannedByItem.set(w.item_id, (plannedByItem.get(w.item_id) ?? 0) + q);
  }
  const productLines = Object.values(
    lines.reduce<Record<string, { item_id: string; item: Line["item"]; remaining: number; qty: number }>>((acc, l) => {
      const e = (acc[l.item_id] ??= { item_id: l.item_id, item: l.item, remaining: 0, qty: 0 });
      e.qty += l.qty;
      e.remaining += Math.max(l.qty - l.qty_delivered, 0);
      return acc;
    }, {}),
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {order.order_no} <StatusBadge map={ORDER_STATUS} status={order.status} />
          </span>
        }
        back={{ href: "/orders", label: "Order Masuk" }}
        actions={
          <>
            {editable && <LinkButton href={`/orders/${id}/edit`}>Ubah</LinkButton>}
            {order.status === "DRAFT" && (
              <ActionButton action={setOrderStatus.bind(null, id, "CONFIRMED")} variant="primary">
                Konfirmasi Order
              </ActionButton>
            )}
            {order.status === "CONFIRMED" && (
              <ActionButton action={setOrderStatus.bind(null, id, "DRAFT")}>Kembalikan ke Draft</ActionButton>
            )}
            {order.status !== "DRAFT" && order.status !== "CANCELLED" && (
              <LinkButton href={`/invoices/new?order=${id}`} variant="primary">
                Buat Invoice
              </LinkButton>
            )}
            {order.status === "PARTIAL" && (
              <ActionButton
                action={setOrderStatus.bind(null, id, "DELIVERED")}
                confirmText="Tutup order? Sisa qty yang belum dikirim tidak akan dikirim lagi."
              >
                Tutup Order
              </ActionButton>
            )}
            {["DRAFT", "CONFIRMED", "IN_PRODUCTION"].includes(order.status) && (
              <ActionButton
                action={setOrderStatus.bind(null, id, "CANCELLED")}
                confirmText="Batalkan order ini?"
                variant="danger"
              >
                Batalkan
              </ActionButton>
            )}
            {order.status === "DRAFT" && (
              <ActionButton action={deleteOrder.bind(null, id)} confirmText="Hapus order ini?" variant="danger">
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
              { label: "Customer", value: order.customer_name },
              { label: "No. PO Customer", value: order.customer_po ?? "-" },
              { label: "Tanggal Order", value: formatDate(order.order_date) },
              { label: "Due Date", value: formatDate(order.due_date) },
              { label: "Total", value: <b>{formatIDR(order.total_amount)}</b> },
              { label: "Sudah Diinvoice", value: formatIDR(order.invoiced_amount) },
            ]}
          />
          {order.notes && <p className="mt-4 whitespace-pre-line text-sm text-slate-600">{order.notes}</p>}
        </Card>

        <Card title="Produk" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Produk</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Terkirim</Th>
                <Th className="text-right">Sisa</Th>
                <Th className="text-right">Stok FG</Th>
                <Th className="text-right">Harga</Th>
                <Th className="text-right">Subtotal</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => {
                const s = stockById.get(l.item_id);
                const rem = l.qty - l.qty_delivered;
                return (
                  <tr key={l.id}>
                    <Td>
                      {l.item.sku} · {l.item.name}
                      {l.notes && <div className="text-xs text-slate-500">{l.notes}</div>}
                    </Td>
                    <Td className="num">
                      {formatQty(l.qty)} {l.item.unit}
                    </Td>
                    <Td className="num">{formatQty(l.qty_delivered)}</Td>
                    <Td className="num font-medium">{formatQty(rem)}</Td>
                    <Td className={`num ${s && s.on_hand < rem ? "text-red-600" : "text-emerald-700"}`}>
                      {formatQty(s?.on_hand ?? 0)}
                    </Td>
                    <Td className="num">{formatIDR(l.unit_price)}</Td>
                    <Td className="num">{formatIDR(l.qty * l.unit_price)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        <Card
          title="Kebutuhan Material (sisa order, sebelum dikurangi stok FG)"
          actions={<LinkButton href="/mrp" size="sm">Lihat MRP lengkap →</LinkButton>}
          bodyClassName="p-0"
        >
          {needs.missingBom.length > 0 && (
            <div className="p-3">
              <Alert tone="amber">
                Ada produk yang belum memiliki BOM aktif:{" "}
                {needs.missingBom.map((mid) => stockById.get(mid)?.sku ?? mid).join(", ")}.{" "}
                <Link href="/bom/new" className="underline">
                  Buat BOM
                </Link>
              </Alert>
            </div>
          )}
          <Table>
            <thead>
              <tr>
                <Th>Material</Th>
                <Th className="text-right">Kebutuhan</Th>
                <Th className="text-right">Stok</Th>
                <Th className="text-right">Kurang</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {needs.rows.length === 0 && <EmptyRow colSpan={5}>Tidak ada kebutuhan material</EmptyRow>}
              {needs.rows.map((r) => (
                <tr key={r.item.id}>
                  <Td>
                    {r.item.sku} · {r.item.name}
                  </Td>
                  <Td className="num">
                    {formatQty(r.required)} {r.item.unit}
                  </Td>
                  <Td className="num">{formatQty(r.onHand)}</Td>
                  <Td className={`num ${r.shortage > 0 ? "font-semibold text-red-600" : ""}`}>
                    {r.shortage > 0 ? formatQty(r.shortage) : "-"}
                  </Td>
                  <Td>{r.shortage > 0 ? <Badge tone="red">Kurang</Badge> : <Badge tone="green">Cukup</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Produksi (Work Order)">
          {(wos ?? []).length > 0 && (
            <div className="mb-4 overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <thead>
                  <tr>
                    <Th>No. WO</Th>
                    <Th>Produk</Th>
                    <Th className="text-right">Rencana</Th>
                    <Th className="text-right">Hasil</Th>
                    <Th>Tanggal</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(wos ?? []).map((w) => (
                    <tr key={w.id}>
                      <Td>
                        <Link href={`/work-orders/${w.id}`} className="font-medium text-brand-700 hover:underline">
                          {w.wo_no}
                        </Link>
                      </Td>
                      <Td>
                        {w.item_sku} · {w.item_name}
                      </Td>
                      <Td className="num">{formatQty(w.qty_planned)}</Td>
                      <Td className="num">{formatQty(w.qty_produced)}</Td>
                      <Td>{formatDate(w.planned_date)}</Td>
                      <Td>
                        <StatusBadge map={WO_STATUS} status={w.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
          {active ? (
            <ActionForm action={createWorkOrdersForOrder.bind(null, id)} className="space-y-3">
              <p className="text-sm text-slate-600">
                Buat Work Order untuk order ini. Qty default = sisa order − stok FG − WO yang sudah dibuat.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {productLines.map((p) => {
                  const s = stockById.get(p.item_id);
                  const planned = plannedByItem.get(p.item_id) ?? 0;
                  const suggested = Math.max(p.remaining - Math.max(s?.on_hand ?? 0, 0) - planned, 0);
                  return (
                    <Field
                      key={p.item_id}
                      label={`${p.item.sku} · ${p.item.name}`}
                      hint={`Sisa ${formatQty(p.remaining)} · stok ${formatQty(s?.on_hand ?? 0)} · sudah di-WO ${formatQty(planned)}`}
                    >
                      <Input name={`wo_${p.item_id}`} type="number" step="any" min={0} defaultValue={suggested || ""} />
                    </Field>
                  );
                })}
                <Field label="Tanggal rencana produksi">
                  <Input name="planned_date" type="date" defaultValue={todayISO()} />
                </Field>
              </div>
              <SubmitButton>Buat Work Order</SubmitButton>
            </ActionForm>
          ) : (
            order.status === "DRAFT" && (
              <p className="text-sm text-slate-500">Konfirmasi order terlebih dahulu untuk membuat Work Order.</p>
            )
          )}
        </Card>

        <Card title="Pengiriman (Surat Jalan)">
          {(deliveries ?? []).length > 0 && (
            <ul className="mb-4 divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
              {(deliveries ?? []).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="font-medium">{d.delivery_no}</span>
                  <span className="text-slate-500">{formatDate(d.delivery_date)}</span>
                  <span className="text-slate-600">
                    {d.delivery_lines
                      .map((dl) => `${dl.item.sku}: ${formatQty(dl.qty)} ${dl.item.unit}`)
                      .join(", ")}
                  </span>
                  {d.notes && <span className="w-full text-xs text-slate-500">{d.notes}</span>}
                </li>
              ))}
            </ul>
          )}
          {active ? (
            <ActionForm action={deliverOrder.bind(null, id)} confirmText="Simpan pengiriman? Stok barang jadi akan berkurang." className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {lines
                  .filter((l) => l.qty > l.qty_delivered)
                  .map((l) => {
                    const rem = l.qty - l.qty_delivered;
                    const onHand = Math.max(stockById.get(l.item_id)?.on_hand ?? 0, 0);
                    return (
                      <Field
                        key={l.id}
                        label={`${l.item.sku} · ${l.item.name}`}
                        hint={`Sisa ${formatQty(rem)} · stok ${formatQty(onHand)}`}
                      >
                        <Input
                          name={`qty_${l.id}`}
                          type="number"
                          step="any"
                          min={0}
                          max={rem}
                          defaultValue={Math.min(rem, onHand) || ""}
                        />
                      </Field>
                    );
                  })}
                <Field label="Tanggal kirim">
                  <Input name="date" type="date" defaultValue={todayISO()} />
                </Field>
                <Field label="Catatan (kurir, no. kendaraan, …)" className="md:col-span-2">
                  <Input name="notes" />
                </Field>
              </div>
              <SubmitButton variant="success">Kirim Barang</SubmitButton>
            </ActionForm>
          ) : (
            (deliveries ?? []).length === 0 && <p className="text-sm text-slate-500">Belum ada pengiriman.</p>
          )}
        </Card>

        <Card title="Invoice">
          {(invoices ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada invoice untuk order ini.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {(invoices ?? []).map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/invoices/${inv.id}`} className="font-medium text-brand-700 hover:underline">
                    {inv.invoice_no}
                  </Link>
                  <span className="text-slate-500">{formatDate(inv.invoice_date)}</span>
                  <span className="num">{formatIDR(inv.total)}</span>
                  <StatusBadge map={INVOICE_STATUS} status={inv.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
