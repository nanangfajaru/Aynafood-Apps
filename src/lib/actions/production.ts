"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayISO } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { friendlyError, num, str, strOrNull, type ActionResult } from "./common";

function revalidateProduction(id?: string) {
  revalidatePath("/work-orders");
  if (id) revalidatePath(`/work-orders/${id}`);
  revalidatePath("/mrp");
  revalidatePath("/orders", "layout");
  revalidatePath("/inventory");
  revalidatePath("/");
}

/** Dari halaman MRP: buat WO untuk FG yang dicentang. Field: sel_<item>, qty_<item>. */
export async function createWorkOrdersFromMrp(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const selected = fd.getAll("sel").map(String);
  if (selected.length === 0) return { error: "Centang minimal 1 produk" };
  const date = str(fd, "planned_date") || todayISO();

  let created = 0;
  for (const itemId of selected) {
    const qty = num(fd, `qty_${itemId}`);
    if (qty <= 0) continue;
    const { error } = await supabase.rpc("create_work_order", {
      p_item_id: itemId,
      p_qty: qty,
      p_order_id: null,
      p_planned_date: date,
      p_notes: "Dibuat dari MRP",
    });
    if (error) return { error: friendlyError(error) };
    created++;
  }
  if (created === 0) return { error: "Qty produksi harus > 0" };
  revalidateProduction();
  return { ok: true, message: `${created} Work Order dibuat. Kebutuhan material sudah diperbarui.` };
}

/** Dari halaman MRP: buat PO draft per supplier. Field: sel, qty_<item>, sup_<item>. */
export async function createPurchaseOrdersFromMrp(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const selected = fd.getAll("sel").map(String);
  if (selected.length === 0) return { error: "Centang minimal 1 material" };

  const { data: items } = await supabase.from("items").select("id, sku, cost_price").in("id", selected);
  const costById = new Map((items ?? []).map((i) => [i.id, i]));

  const bySupplier = new Map<string, { item_id: string; qty: number; unit_price: number }[]>();
  const missingSupplier: string[] = [];
  for (const itemId of selected) {
    const qty = num(fd, `qty_${itemId}`);
    if (qty <= 0) continue;
    const sup = str(fd, `sup_${itemId}`);
    if (!sup) {
      missingSupplier.push(costById.get(itemId)?.sku ?? itemId);
      continue;
    }
    const arr = bySupplier.get(sup) ?? [];
    arr.push({ item_id: itemId, qty, unit_price: Number(costById.get(itemId)?.cost_price ?? 0) });
    bySupplier.set(sup, arr);
  }
  if (missingSupplier.length) return { error: `Pilih supplier untuk: ${missingSupplier.join(", ")}` };
  if (bySupplier.size === 0) return { error: "Qty PO harus > 0" };

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, lead_time_days")
    .in("id", [...bySupplier.keys()]);
  const leadById = new Map((suppliers ?? []).map((s) => [s.id, s.lead_time_days as number]));
  const today = todayISO();

  const created: string[] = [];
  for (const [supplierId, lines] of bySupplier) {
    const expected = new Date(`${today}T00:00:00Z`);
    expected.setUTCDate(expected.getUTCDate() + (leadById.get(supplierId) ?? 0));
    const { data, error } = await supabase.rpc("save_purchase_order", {
      p_id: null,
      p_data: {
        supplier_id: supplierId,
        order_date: today,
        expected_date: expected.toISOString().slice(0, 10),
        tax_rate: 0,
        source: "MRP",
        notes: "Dibuat dari saran MRP",
        lines: lines.map((l) => ({ ...l, notes: "" })),
      },
    });
    if (error) return { error: friendlyError(error) };
    created.push(data);
  }
  revalidatePath("/purchase-orders");
  revalidatePath("/mrp");
  if (created.length === 1) redirect(`/purchase-orders/${created[0]}`);
  redirect("/purchase-orders?tab=DRAFT");
}

// ------------------------------------------------------------ Work Order
export async function createWorkOrder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_work_order", {
    p_item_id: str(fd, "item_id"),
    p_qty: num(fd, "qty"),
    p_order_id: strOrNull(fd, "order_id"),
    p_planned_date: str(fd, "planned_date") || null,
    p_bom_id: strOrNull(fd, "bom_id"),
    p_notes: strOrNull(fd, "notes"),
  });
  if (error) return { error: friendlyError(error) };
  revalidateProduction();
  redirect(`/work-orders/${data}`);
}

export async function setWorkOrderStatus(id: string, status: string, _: ActionResult): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_work_order_status", { p_id: id, p_status: status });
  if (error) return { error: friendlyError(error) };
  revalidateProduction(id);
  return { ok: true };
}

/** Selesaikan WO. Field: qty_produced, date, notes, mat_<item_id> (konsumsi aktual). */
export async function completeWorkOrder(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const materials = [...fd.keys()]
    .filter((k) => k.startsWith("mat_"))
    .map((k) => ({ item_id: k.slice(4), qty: num(fd, k) }));
  const { error } = await supabase.rpc("complete_work_order", {
    p_id: id,
    p_qty_produced: num(fd, "qty_produced"),
    p_date: str(fd, "date") || null,
    p_materials: materials,
    p_notes: strOrNull(fd, "notes"),
  });
  if (error) return { error: friendlyError(error) };
  revalidateProduction(id);
  return { ok: true, message: "Produksi selesai: material terpotong & stok barang jadi bertambah" };
}
