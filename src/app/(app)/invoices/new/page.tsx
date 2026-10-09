import { InvoiceForm } from "@/components/invoice-form";
import { Alert, Card, PageHeader } from "@/components/ui";
import type { InvoicePayload } from "@/lib/actions/invoices";
import { formatIDR, todayISO } from "@/lib/format";
import { addDays } from "@/lib/mrp";
import { getCompany, getCustomers, getItemOptions } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Invoice Baru" };

type OrderWithLines = {
  id: string;
  order_no: string;
  customer_id: string;
  invoiced_amount: number;
  total_amount: number;
  customer_po: string | null;
};

export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  const { order: orderId } = await searchParams;
  const { supabase } = await requireUser();
  const [customers, items, company] = await Promise.all([
    getCustomers(supabase),
    getItemOptions(supabase),
    getCompany(supabase),
  ]);
  const today = todayISO();

  let initial: InvoicePayload = {
    customer_id: "",
    order_id: null,
    invoice_date: today,
    due_date: addDays(today, company.default_payment_terms),
    tax_rate: company.default_tax_rate,
    discount_amount: 0,
    deduct_stock: true,
    notes: "",
    lines: [],
  };
  let order: OrderWithLines | null = null;

  if (typeof orderId === "string") {
    const [{ data: o }, { data: lines }] = await Promise.all([
      supabase.from("v_orders").select("id, order_no, customer_id, invoiced_amount, total_amount, customer_po").eq("id", orderId).maybeSingle<OrderWithLines>(),
      supabase.from("order_lines").select("qty, unit_price, item_id, item:items(name, unit)").eq("order_id", orderId).order("sort")
        .returns<{ qty: number; unit_price: number; item_id: string; item: { name: string; unit: string } }[]>(),
    ]);
    if (o) {
      order = o;
      const terms = customers.find((c) => c.id === o.customer_id)?.payment_terms ?? company.default_payment_terms;
      initial = {
        ...initial,
        customer_id: o.customer_id,
        order_id: o.id,
        due_date: addDays(today, terms),
        deduct_stock: false,
        notes: o.customer_po ? `PO Customer: ${o.customer_po}` : "",
        lines: (lines ?? []).map((l) => ({
          item_id: l.item_id,
          description: l.item.name,
          qty: l.qty,
          unit: l.item.unit,
          unit_price: l.unit_price,
          discount_pct: 0,
        })),
      };
    }
  }

  return (
    <>
      <PageHeader title="Invoice Baru" back={{ href: order ? `/orders/${order.id}` : "/invoices", label: order ? order.order_no : "Invoice" }} />
      {order && order.invoiced_amount > 0 && (
        <div className="mb-4">
          <Alert tone="amber">
            Order ini sudah diinvoice {formatIDR(order.invoiced_amount)} dari {formatIDR(order.total_amount)}. Sesuaikan qty
            agar tidak tertagih dua kali.
          </Alert>
        </div>
      )}
      <Card>
        <InvoiceForm id={null} initial={initial} customers={customers} items={items} orderLabel={order?.order_no} />
      </Card>
    </>
  );
}
