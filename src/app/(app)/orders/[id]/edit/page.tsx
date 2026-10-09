import { notFound } from "next/navigation";
import { OrderForm } from "@/components/order-form";
import { Card, PageHeader } from "@/components/ui";
import { getCustomers, getItemOptions } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export default async function EditOrderPage({ params }: PageProps<"/orders/[id]/edit">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: order }, customers, products] = await Promise.all([
    supabase.from("orders").select("*, order_lines(*)").eq("id", id).maybeSingle(),
    getCustomers(supabase),
    getItemOptions(supabase, ["FG"]),
  ]);
  if (!order) notFound();
  const lines = [...order.order_lines].sort((a, b) => a.sort - b.sort);

  return (
    <>
      <PageHeader title={`Ubah ${order.order_no}`} back={{ href: `/orders/${id}`, label: order.order_no }} />
      <Card>
        <OrderForm
          id={id}
          customers={customers}
          products={products}
          initial={{
            customer_id: order.customer_id,
            customer_po: order.customer_po ?? "",
            order_date: order.order_date,
            due_date: order.due_date ?? "",
            notes: order.notes ?? "",
            lines: lines.map((l) => ({ item_id: l.item_id, qty: l.qty, unit_price: l.unit_price, notes: l.notes ?? "" })),
          }}
        />
      </Card>
    </>
  );
}
