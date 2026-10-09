"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { bool, friendlyError, num, str, strOrNull, type ActionResult } from "./common";

// ------------------------------------------------------------ Customer / Supplier
export async function savePartner(
  kind: "customers" | "suppliers",
  id: string | null,
  _: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const row: Record<string, unknown> = {
    code: str(fd, "code"),
    name: str(fd, "name"),
    contact_person: strOrNull(fd, "contact_person"),
    phone: strOrNull(fd, "phone"),
    email: strOrNull(fd, "email"),
    address: strOrNull(fd, "address"),
    npwp: strOrNull(fd, "npwp"),
    notes: strOrNull(fd, "notes"),
    is_active: bool(fd, "is_active"),
  };
  if (!row.code || !row.name) return { error: "Kode dan nama wajib diisi" };
  if (kind === "customers") row.payment_terms = num(fd, "payment_terms", 30);
  else row.lead_time_days = num(fd, "lead_time_days", 0);

  const { error } = id
    ? await supabase.from(kind).update(row).eq("id", id)
    : await supabase.from(kind).insert(row);
  if (error) return { error: friendlyError(error) };

  revalidatePath(`/${kind}`);
  redirect(`/${kind}`);
}

export async function deletePartner(
  kind: "customers" | "suppliers",
  id: string,
  _: ActionResult,
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from(kind).delete().eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/${kind}`);
  redirect(`/${kind}`);
}

// ------------------------------------------------------------ Items
export async function saveItem(id: string | null, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const row = {
    sku: str(fd, "sku"),
    name: str(fd, "name"),
    item_type: str(fd, "item_type"),
    unit: str(fd, "unit") || "pcs",
    sale_price: num(fd, "sale_price"),
    cost_price: num(fd, "cost_price"),
    min_stock: num(fd, "min_stock"),
    moq: num(fd, "moq"),
    order_multiple: num(fd, "order_multiple"),
    lead_time_days: num(fd, "lead_time_days"),
    default_supplier_id: strOrNull(fd, "default_supplier_id"),
    notes: strOrNull(fd, "notes"),
    is_active: bool(fd, "is_active"),
  };
  if (!row.sku || !row.name) return { error: "SKU dan nama wajib diisi" };
  if (!["FG", "RM", "PKG"].includes(row.item_type)) return { error: "Tipe item tidak valid" };

  const { error } = id
    ? await supabase.from("items").update(row).eq("id", id)
    : await supabase.from("items").insert(row);
  if (error) return { error: friendlyError(error) };

  revalidatePath("/items");
  redirect(`/items?type=${row.item_type}`);
}

export async function deleteItem(id: string, _: ActionResult): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/items");
  redirect("/items");
}

// ------------------------------------------------------------ Stok
export async function adjustStock(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const itemId = str(fd, "item_id");
  if (!itemId) return { error: "Pilih item terlebih dahulu" };
  const unitCost = num(fd, "unit_cost", 0);
  const { error } = await supabase.rpc("adjust_stock", {
    p_item_id: itemId,
    p_mode: str(fd, "mode"),
    p_qty: num(fd, "qty"),
    p_date: str(fd, "date") || null,
    p_notes: strOrNull(fd, "notes"),
    p_unit_cost: unitCost > 0 ? unitCost : null,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/inventory");
  return { ok: true, message: "Stok berhasil disesuaikan" };
}

// ------------------------------------------------------------ Pengaturan
export async function saveSettings(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("company_settings")
    .update({
      name: str(fd, "name") || "Aynafood",
      address: strOrNull(fd, "address"),
      phone: strOrNull(fd, "phone"),
      email: strOrNull(fd, "email"),
      npwp: strOrNull(fd, "npwp"),
      logo_url: strOrNull(fd, "logo_url"),
      bank_name: strOrNull(fd, "bank_name"),
      bank_account: strOrNull(fd, "bank_account"),
      bank_holder: strOrNull(fd, "bank_holder"),
      default_tax_rate: num(fd, "default_tax_rate", 11),
      default_payment_terms: num(fd, "default_payment_terms", 30),
      invoice_footer: strOrNull(fd, "invoice_footer"),
    })
    .eq("id", 1);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Pengaturan tersimpan" };
}
