import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Alert, Badge, Card, EmptyRow, Input, PageHeader, Select, Stat, Table, Td, Th } from "@/components/ui";
import { createPurchaseOrdersFromMrp, createWorkOrdersFromMrp } from "@/lib/actions/production";
import { ITEM_TYPES } from "@/lib/constants";
import { formatDate, formatIDR, formatQty, todayISO } from "@/lib/format";
import { computeMrp, type MrpItem, type MrpOrderLine } from "@/lib/mrp";
import { getActiveBoms, getItemStocks, getSuppliers } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "MRP" };

export default async function MrpPage({ searchParams }: PageProps<"/mrp">) {
  const sp = await searchParams;
  // default: stok FG dihitung, safety stock dihitung, draft tidak
  const configured = sp.run === "1";
  const options = {
    includeDraft: sp.draft === "on",
    netFgStock: configured ? sp.fg === "on" : true,
    includeSafetyStock: configured ? sp.safety === "on" : true,
    today: todayISO(),
  };

  const { supabase } = await requireUser();
  const [stocks, boms, suppliers, { data: openLines }] = await Promise.all([
    getItemStocks(supabase),
    getActiveBoms(supabase),
    getSuppliers(supabase),
    supabase.from("v_open_order_lines").select("*").returns<MrpOrderLine[]>(),
  ]);
  const items: MrpItem[] = stocks.filter((s) => s.is_active || s.on_hand !== 0);
  const result = computeMrp(items, openLines ?? [], boms, options);
  const toProduce = result.fgPlans.filter((p) => p.netToProduce > 0);

  return (
    <>
      <PageHeader
        title="MRP · Perencanaan Kebutuhan"
        description="Kebutuhan produksi & material dari order terbuka, sudah dikurangi stok, PO berjalan dan WO berjalan."
      />

      <form className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        <input type="hidden" name="run" value="1" />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="fg" defaultChecked={options.netFgStock} /> Kurangi stok barang jadi
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="safety" defaultChecked={options.includeSafetyStock} /> Hitung safety stock (stok minimum)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="draft" defaultChecked={options.includeDraft} /> Sertakan order DRAFT (simulasi)
        </label>
        <button className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
          Hitung Ulang
        </button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Order terbuka" value={result.summary.openOrderCount} href="/orders" />
        <Stat label="Produk perlu diproduksi" value={result.summary.fgToProduceCount} tone="violet" />
        <Stat label="Material kurang" value={result.summary.materialShortageCount} tone={result.summary.materialShortageCount ? "red" : "green"} />
        <Stat label="Harus dipesan segera" value={result.summary.lateCount} tone={result.summary.lateCount ? "amber" : "gray"} hint="Lewat tanggal pesan (lead time)" />
        <Stat label="Estimasi pembelian" value={formatIDR(result.summary.estimatedPurchase)} />
      </div>

      {result.missingBom.length > 0 && (
        <div className="mb-6">
          <Alert tone="amber">
            Produk berikut belum punya BOM aktif sehingga kebutuhan materialnya tidak terhitung:{" "}
            {result.missingBom.map((p, i) => (
              <span key={p.item.id}>
                {i > 0 && ", "}
                <Link href={`/bom/new?item=${p.item.id}`} className="font-medium underline">
                  {p.item.sku}
                </Link>
              </span>
            ))}
          </Alert>
        </div>
      )}

      {/* ---------------------------------------------------------------- FG */}
      <Card title="1. Rencana Produksi (Barang Jadi)" className="mb-6" bodyClassName="p-0">
        <ActionForm action={createWorkOrdersFromMrp} errorClassName="px-4 pb-4">
          <Table>
            <thead>
              <tr>
                <Th className="w-8" />
                <Th>Produk</Th>
                <Th className="text-right">Kebutuhan Order</Th>
                <Th className="text-right">Stok FG</Th>
                <Th className="text-right">WO Berjalan</Th>
                <Th className="text-right">Safety</Th>
                <Th className="text-right">Perlu Produksi</Th>
                <Th>Due Terdekat</Th>
                <Th className="w-36 text-right">Qty WO</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.fgPlans.length === 0 && <EmptyRow colSpan={9}>Tidak ada order terbuka</EmptyRow>}
              {result.fgPlans.map((p) => (
                <tr key={p.item.id} className={p.netToProduce > 0 ? "" : "text-slate-400"}>
                  <Td>
                    {p.netToProduce > 0 && p.bomId && (
                      <input type="checkbox" name="sel" value={p.item.id} defaultChecked aria-label={`Pilih ${p.item.sku}`} />
                    )}
                  </Td>
                  <Td>
                    <div className="font-medium text-slate-800">
                      {p.item.sku} · {p.item.name}
                    </div>
                    {!p.bomId && <Badge tone="red">Belum ada BOM</Badge>}
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-slate-500">Alokasi per order ({p.orders.length})</summary>
                      <table className="mt-1 w-full text-xs">
                        <tbody>
                          {p.orders.map((o) => (
                            <tr key={o.order_id}>
                              <td className="py-0.5 pr-2">
                                <Link href={`/orders/${o.order_id}`} className="text-brand-700 hover:underline">
                                  {o.order_no}
                                </Link>
                              </td>
                              <td className="pr-2 text-slate-500">{o.customer_name}</td>
                              <td className="pr-2 text-slate-500">{formatDate(o.due_date)}</td>
                              <td className="num pr-2">sisa {formatQty(o.qty_remaining)}</td>
                              <td className="num pr-2 text-emerald-700">stok {formatQty(o.qty_covered)}</td>
                              <td className="num font-medium text-violet-700">produksi {formatQty(o.qty_to_produce)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  </Td>
                  <Td className="num">{formatQty(p.demand)}</Td>
                  <Td className="num">{options.netFgStock ? formatQty(p.onHand) : <s>{formatQty(p.onHand)}</s>}</Td>
                  <Td className="num">{formatQty(p.woSupply)}</Td>
                  <Td className="num">{formatQty(p.safetyTopUp)}</Td>
                  <Td className="num font-semibold text-violet-700">
                    {formatQty(p.netToProduce)} {p.item.unit}
                  </Td>
                  <Td>{formatDate(p.earliestDue)}</Td>
                  <Td>
                    {p.netToProduce > 0 && p.bomId && (
                      <Input
                        name={`qty_${p.item.id}`}
                        type="number"
                        step="any"
                        min={0}
                        defaultValue={p.netToProduce}
                        className="text-right"
                      />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {toProduce.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3">
              <label className="flex items-center gap-2 text-sm">
                Tanggal produksi
                <Input type="date" name="planned_date" defaultValue={options.today} className="w-40" />
              </label>
              <SubmitButton>Buat Work Order untuk yang dicentang</SubmitButton>
              <span className="text-xs text-slate-500">
                WO yang dibuat akan mengalokasikan material & mengurangi kebutuhan produksi di atas.
              </span>
            </div>
          )}
        </ActionForm>
      </Card>

      {/* ---------------------------------------------------------- Material */}
      <Card title="2. Kebutuhan Material & Saran Pembelian" bodyClassName="p-0">
        <ActionForm action={createPurchaseOrdersFromMrp} errorClassName="px-4 pb-4">
          <Table>
            <thead>
              <tr>
                <Th className="w-8" />
                <Th>Material</Th>
                <Th className="text-right">Kebutuhan Order</Th>
                <Th className="text-right">WO Berjalan</Th>
                <Th className="text-right">Safety</Th>
                <Th className="text-right">Stok</Th>
                <Th className="text-right">PO Berjalan</Th>
                <Th className="text-right">Kurang</Th>
                <Th className="w-32 text-right">Saran PO</Th>
                <Th className="w-48">Supplier</Th>
                <Th>Pesan Paling Lambat</Th>
                <Th className="text-right">Estimasi</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.materials.length === 0 && (
                <EmptyRow colSpan={12}>Tidak ada kebutuhan material. Semua stok mencukupi 🎉</EmptyRow>
              )}
              {result.materials.map((m) => (
                <tr key={m.item.id} className={m.shortage > 0 ? "" : "bg-emerald-50/40"}>
                  <Td>
                    {m.suggestedQty > 0 && (
                      <input type="checkbox" name="sel" value={m.item.id} defaultChecked aria-label={`Pilih ${m.item.sku}`} />
                    )}
                  </Td>
                  <Td>
                    <div className="font-medium text-slate-800">
                      {m.item.sku} · {m.item.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <Badge tone={ITEM_TYPES[m.item.item_type].tone}>{ITEM_TYPES[m.item.item_type].label}</Badge>
                      {m.item.moq > 0 && <Badge>MOQ {formatQty(m.item.moq)}</Badge>}
                      {m.item.order_multiple > 0 && <Badge>Kelipatan {formatQty(m.item.order_multiple)}</Badge>}
                    </div>
                    {m.sources.length > 0 && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-slate-500">Rincian per order ({m.sources.length})</summary>
                        <table className="mt-1 w-full text-xs">
                          <tbody>
                            {m.sources.map((s, i) => (
                              <tr key={i}>
                                <td className="py-0.5 pr-2">
                                  {s.order_id ? (
                                    <Link href={`/orders/${s.order_id}`} className="text-brand-700 hover:underline">
                                      {s.order_no}
                                    </Link>
                                  ) : (
                                    <span className="text-slate-500">Safety stock FG</span>
                                  )}
                                </td>
                                <td className="pr-2 text-slate-500">
                                  {s.fg_sku} × {formatQty(s.fg_qty)}
                                </td>
                                <td className="pr-2 text-slate-500">{formatDate(s.due_date)}</td>
                                <td className="num font-medium">
                                  {formatQty(s.qty)} {m.item.unit}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    )}
                  </Td>
                  <Td className="num">{formatQty(m.grossFromOrders)}</Td>
                  <Td className="num">{formatQty(m.woDemand)}</Td>
                  <Td className="num">{formatQty(m.safetyStock)}</Td>
                  <Td className="num">{formatQty(m.onHand)}</Td>
                  <Td className="num">{formatQty(m.onOrder)}</Td>
                  <Td className={`num ${m.shortage > 0 ? "font-semibold text-red-600" : "text-emerald-700"}`}>
                    {m.shortage > 0 ? `${formatQty(m.shortage)} ${m.item.unit}` : "Cukup"}
                  </Td>
                  <Td>
                    {m.suggestedQty > 0 && (
                      <Input
                        name={`qty_${m.item.id}`}
                        type="number"
                        step="any"
                        min={0}
                        defaultValue={m.suggestedQty}
                        className="text-right"
                      />
                    )}
                  </Td>
                  <Td>
                    {m.suggestedQty > 0 && (
                      <Select name={`sup_${m.item.id}`} defaultValue={m.item.default_supplier_id ?? ""}>
                        <option value="">— Pilih —</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Td>
                  <Td>
                    {m.suggestedQty > 0 ? (
                      <div>
                        <div className={m.isLate ? "font-semibold text-red-600" : ""}>{formatDate(m.orderByDate)}</div>
                        <div className="text-xs text-slate-500">
                          butuh {formatDate(m.requiredDate)} · LT {m.leadTimeDays} hr
                        </div>
                        {m.isLate && <Badge tone="red">Terlambat</Badge>}
                      </div>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td className="num">{m.estimatedCost > 0 ? formatIDR(m.estimatedCost) : "-"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {result.materials.some((m) => m.suggestedQty > 0) && (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3">
              <SubmitButton>Buat PO (Draft) dari saran yang dicentang</SubmitButton>
              <span className="text-xs text-slate-500">
                PO dikelompokkan otomatis per supplier dengan harga beli terakhir. Bisa diedit sebelum dikirim.
              </span>
            </div>
          )}
        </ActionForm>
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        Rumus: Kurang = (Kebutuhan Order + WO Berjalan + Safety) − (Stok + PO Berjalan). Saran PO dibulatkan ke MOQ &
        kelipatan beli. Tanggal pesan = due date order terdekat − lead time.
      </p>
    </>
  );
}
