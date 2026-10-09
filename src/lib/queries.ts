import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MrpBom } from "./mrp";
import type { Company, ItemOption, ItemStock, PartnerOption } from "./types";

export async function getSuppliers(supabase: SupabaseClient): Promise<PartnerOption[]> {
  const { data } = await supabase.from("suppliers").select("id, code, name").eq("is_active", true).order("code");
  return data ?? [];
}

export async function getCustomers(supabase: SupabaseClient): Promise<PartnerOption[]> {
  const { data } = await supabase
    .from("customers")
    .select("id, code, name, payment_terms")
    .eq("is_active", true)
    .order("code");
  return data ?? [];
}

export async function getItemOptions(supabase: SupabaseClient, types?: string[]): Promise<ItemOption[]> {
  let q = supabase
    .from("items")
    .select("id, sku, name, unit, item_type, sale_price, cost_price")
    .eq("is_active", true)
    .order("sku");
  if (types) q = q.in("item_type", types);
  const { data } = await q;
  return data ?? [];
}

export async function getItemStocks(supabase: SupabaseClient): Promise<ItemStock[]> {
  const { data } = await supabase.from("v_item_stock").select("*").order("sku");
  return data ?? [];
}

/** BOM default (aktif) per produk, untuk perhitungan MRP. */
export async function getActiveBoms(supabase: SupabaseClient): Promise<MrpBom[]> {
  const { data } = await supabase
    .from("boms")
    .select("id, item_id, output_qty, is_default, created_at, bom_lines(material_id, qty, scrap_pct)")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  const byItem = new Map<string, MrpBom>();
  for (const b of data ?? []) {
    if (byItem.has(b.item_id)) continue; // ambil default / terbaru
    byItem.set(b.item_id, {
      id: b.id,
      item_id: b.item_id,
      output_qty: Number(b.output_qty),
      lines: (b.bom_lines ?? []).map((l: { material_id: string; qty: number; scrap_pct: number }) => ({
        material_id: l.material_id,
        qty: Number(l.qty),
        scrap_pct: Number(l.scrap_pct),
      })),
    });
  }
  return [...byItem.values()];
}

export async function getCompany(supabase: SupabaseClient): Promise<Company> {
  const { data } = await supabase.from("company_settings").select("*").eq("id", 1).single();
  return data as Company;
}

export type InvoiceFull = {
  invoice: {
    id: string;
    invoice_no: string;
    invoice_date: string;
    due_date: string | null;
    status: string;
    order_id: string | null;
    order_no: string | null;
    deduct_stock: boolean;
    subtotal: number;
    discount_amount: number;
    dpp: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
    amount_paid: number;
    balance: number;
    is_overdue: boolean;
    notes: string | null;
  };
  customer: {
    code: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    npwp: string | null;
  };
  lines: {
    id: string;
    description: string;
    qty: number;
    unit: string | null;
    unit_price: number;
    discount_pct: number;
    line_total: number;
  }[];
  payments: {
    id: string;
    payment_date: string;
    amount: number;
    method: string;
    reference: string | null;
    notes: string | null;
  }[];
  company: Company;
};

export async function getInvoiceFull(supabase: SupabaseClient, id: string): Promise<InvoiceFull | null> {
  const { data: invoice } = await supabase.from("v_invoices").select("*").eq("id", id).maybeSingle();
  if (!invoice) return null;
  const [{ data: customer }, { data: lines }, { data: payments }, company] = await Promise.all([
    supabase.from("customers").select("code, name, address, phone, email, npwp").eq("id", invoice.customer_id).single(),
    supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("sort"),
    supabase.from("payments").select("*").eq("invoice_id", id).order("payment_date"),
    getCompany(supabase),
  ]);
  return { invoice, customer, lines: lines ?? [], payments: payments ?? [], company } as InvoiceFull;
}
