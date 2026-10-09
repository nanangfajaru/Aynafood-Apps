"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { friendlyError, num, str, strOrNull, type ActionResult } from "./common";

export type InvoicePayload = {
  customer_id: string;
  order_id: string | null;
  invoice_date: string;
  due_date: string;
  tax_rate: number;
  discount_amount: number;
  deduct_stock: boolean;
  notes: string;
  lines: {
    item_id: string | null;
    description: string;
    qty: number;
    unit: string;
    unit_price: number;
    discount_pct: number;
  }[];
};

function revalidateInvoices(id?: string) {
  revalidatePath("/invoices");
  if (id) revalidatePath(`/invoices/${id}`);
  revalidatePath("/orders", "layout");
  revalidatePath("/inventory");
  revalidatePath("/");
}

export async function saveInvoice(id: string | null, payload: InvoicePayload): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!payload.customer_id) return { error: "Pilih customer" };
  const lines = payload.lines.filter((l) => l.description.trim() || l.item_id);
  if (lines.length === 0) return { error: "Tambahkan minimal 1 baris" };
  if (lines.some((l) => !(l.qty > 0))) return { error: "Qty harus > 0" };
  if (lines.some((l) => !l.description.trim())) return { error: "Deskripsi baris wajib diisi" };

  const { data, error } = await supabase.rpc("save_invoice", { p_id: id, p_data: { ...payload, lines } });
  if (error) return { error: friendlyError(error) };
  revalidateInvoices(data);
  redirect(`/invoices/${data}`);
}

export async function issueInvoice(id: string, _: ActionResult): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("issue_invoice", { p_id: id });
  if (error) return { error: friendlyError(error) };
  revalidateInvoices(id);
  return { ok: true };
}

export async function voidInvoice(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("void_invoice", { p_id: id, p_reason: strOrNull(fd, "reason") });
  if (error) return { error: friendlyError(error) };
  revalidateInvoices(id);
  return { ok: true };
}

export async function deleteInvoice(id: string, _: ActionResult): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("delete_invoice", { p_id: id });
  if (error) return { error: friendlyError(error) };
  revalidateInvoices();
  redirect("/invoices");
}

export async function addPayment(invoiceId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("add_payment", {
    p_invoice_id: invoiceId,
    p_amount: num(fd, "amount"),
    p_date: str(fd, "date") || null,
    p_method: str(fd, "method") || "TRANSFER",
    p_reference: strOrNull(fd, "reference"),
    p_notes: strOrNull(fd, "notes"),
  });
  if (error) return { error: friendlyError(error) };
  revalidateInvoices(invoiceId);
  return { ok: true, message: "Pembayaran tercatat" };
}

export async function deletePayment(paymentId: string, invoiceId: string, _: ActionResult): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("delete_payment", { p_payment_id: paymentId });
  if (error) return { error: friendlyError(error) };
  revalidateInvoices(invoiceId);
  return { ok: true };
}
