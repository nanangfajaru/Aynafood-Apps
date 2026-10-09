"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { friendlyError, num, str, strOrNull, type ActionResult } from "./common";

export type PoPayload = {
  supplier_id: string;
  order_date: string;
  expected_date: string;
  tax_rate: number;
  notes: string;
  lines: { item_id: string; qty: number; unit_price: number; notes: string }[];
};

function revalidatePo(id?: string) {
  revalidatePath("/purchase-orders");
  if (id) revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/mrp");
  revalidatePath("/inventory");
  revalidatePath("/");
}

export async function savePurchaseOrder(id: string | null, payload: PoPayload): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!payload.supplier_id) return { error: "Pilih supplier" };
  const lines = payload.lines.filter((l) => l.item_id);
  if (lines.length === 0) return { error: "Tambahkan minimal 1 item" };
  if (lines.some((l) => !(l.qty > 0))) return { error: "Qty harus > 0" };

  const { data, error } = await supabase.rpc("save_purchase_order", { p_id: id, p_data: { ...payload, lines } });
  if (error) return { error: friendlyError(error) };
  revalidatePo(data);
  redirect(`/purchase-orders/${data}`);
}

export async function setPurchaseOrderStatus(id: string, status: string, _: ActionResult): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_purchase_order_status", { p_id: id, p_status: status });
  if (error) return { error: friendlyError(error) };
  revalidatePo(id);
  return { ok: true };
}

export async function deletePurchaseOrder(id: string, _: ActionResult): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("delete_purchase_order", { p_id: id });
  if (error) return { error: friendlyError(error) };
  revalidatePo();
  redirect("/purchase-orders");
}

/** Terima barang. Field: rcv_<po_line_id>, date, notes. */
export async function receivePurchaseOrder(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const lines = [...fd.keys()]
    .filter((k) => k.startsWith("rcv_"))
    .map((k) => ({ po_line_id: k.slice(4), qty: num(fd, k) }))
    .filter((l) => l.qty > 0);
  if (lines.length === 0) return { error: "Isi qty yang diterima" };

  const { error } = await supabase.rpc("receive_purchase_order", {
    p_po_id: id,
    p_lines: lines,
    p_date: str(fd, "date") || null,
    p_notes: strOrNull(fd, "notes"),
  });
  if (error) return { error: friendlyError(error) };
  revalidatePo(id);
  return { ok: true, message: "Penerimaan barang tersimpan, stok bertambah" };
}
