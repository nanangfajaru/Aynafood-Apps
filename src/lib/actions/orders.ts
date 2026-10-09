"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { friendlyError, num, str, strOrNull, type ActionResult } from "./common";

export type OrderPayload = {
  customer_id: string;
  customer_po: string;
  order_date: string;
  due_date: string;
  notes: string;
  status?: "DRAFT" | "CONFIRMED";
  lines: { item_id: string; qty: number; unit_price: number; notes: string }[];
};

function revalidateOrders(id?: string) {
  revalidatePath("/orders");
  if (id) revalidatePath(`/orders/${id}`);
  revalidatePath("/mrp");
  revalidatePath("/");
}

export async function saveOrder(id: string | null, payload: OrderPayload): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!payload.customer_id) return { error: "Pilih customer" };
  const lines = payload.lines.filter((l) => l.item_id);
  if (lines.length === 0) return { error: "Tambahkan minimal 1 produk" };
  if (lines.some((l) => !(l.qty > 0))) return { error: "Qty harus > 0" };

  const { data, error } = await supabase.rpc("save_order", { p_id: id, p_data: { ...payload, lines } });
  if (error) return { error: friendlyError(error) };
  revalidateOrders(data);
  redirect(`/orders/${data}`);
}

export async function setOrderStatus(id: string, status: string, _: ActionResult): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_order_status", { p_id: id, p_status: status });
  if (error) return { error: friendlyError(error) };
  revalidateOrders(id);
  return { ok: true };
}

export async function deleteOrder(id: string, _: ActionResult): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("delete_order", { p_id: id });
  if (error) return { error: friendlyError(error) };
  revalidateOrders();
  redirect("/orders");
}

/** Kirim barang (Surat Jalan). Field form: qty_<order_line_id>. */
export async function deliverOrder(orderId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const lines = [...fd.keys()]
    .filter((k) => k.startsWith("qty_"))
    .map((k) => ({ order_line_id: k.slice(4), qty: num(fd, k) }))
    .filter((l) => l.qty > 0);
  if (lines.length === 0) return { error: "Isi qty yang dikirim" };

  const { error } = await supabase.rpc("deliver_order", {
    p_order_id: orderId,
    p_lines: lines,
    p_date: str(fd, "date") || null,
    p_notes: strOrNull(fd, "notes"),
  });
  if (error) return { error: friendlyError(error) };
  revalidateOrders(orderId);
  revalidatePath("/inventory");
  return { ok: true, message: "Pengiriman tersimpan, stok barang jadi berkurang" };
}

/** Buat Work Order dari baris order. Field form: wo_<item_id>. */
export async function createWorkOrdersForOrder(orderId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const reqs = [...fd.keys()]
    .filter((k) => k.startsWith("wo_"))
    .map((k) => ({ item_id: k.slice(3), qty: num(fd, k) }))
    .filter((r) => r.qty > 0);
  if (reqs.length === 0) return { error: "Isi qty produksi minimal untuk 1 produk" };

  const date = str(fd, "planned_date") || null;
  for (const r of reqs) {
    const { error } = await supabase.rpc("create_work_order", {
      p_item_id: r.item_id,
      p_qty: r.qty,
      p_order_id: orderId,
      p_planned_date: date,
    });
    if (error) return { error: friendlyError(error) };
  }
  revalidateOrders(orderId);
  revalidatePath("/work-orders");
  return { ok: true, message: `${reqs.length} Work Order dibuat` };
}
