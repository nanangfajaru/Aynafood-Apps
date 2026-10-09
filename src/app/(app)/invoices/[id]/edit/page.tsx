import { notFound, redirect } from "next/navigation";
import { InvoiceForm } from "@/components/invoice-form";
import { Card, PageHeader } from "@/components/ui";
import { getCustomers, getItemOptions } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export default async function EditInvoicePage({ params }: PageProps<"/invoices/[id]/edit">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: inv }, customers, items] = await Promise.all([
    supabase.from("v_invoices").select("*, invoice_lines(*)").eq("id", id).maybeSingle(),
    getCustomers(supabase),
    getItemOptions(supabase),
  ]);
  if (!inv) notFound();
  if (inv.status !== "DRAFT") redirect(`/invoices/${id}`);
  const lines = [...inv.invoice_lines].sort((a, b) => a.sort - b.sort);

  return (
    <>
      <PageHeader title={`Ubah ${inv.invoice_no}`} back={{ href: `/invoices/${id}`, label: inv.invoice_no }} />
      <Card>
        <InvoiceForm
          id={id}
          customers={customers}
          items={items}
          orderLabel={inv.order_no ?? undefined}
          initial={{
            customer_id: inv.customer_id,
            order_id: inv.order_id,
            invoice_date: inv.invoice_date,
            due_date: inv.due_date ?? "",
            tax_rate: inv.tax_rate,
            discount_amount: inv.discount_amount,
            deduct_stock: inv.deduct_stock,
            notes: inv.notes ?? "",
            lines: lines.map((l) => ({
              item_id: l.item_id,
              description: l.description,
              qty: l.qty,
              unit: l.unit ?? "",
              unit_price: l.unit_price,
              discount_pct: l.discount_pct,
            })),
          }}
        />
      </Card>
    </>
  );
}
