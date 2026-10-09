import { OrderForm } from "@/components/order-form";
import { Card, PageHeader } from "@/components/ui";
import { todayISO } from "@/lib/format";
import { getCustomers, getItemOptions } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Order Baru" };

export default async function NewOrderPage() {
  const { supabase } = await requireUser();
  const [customers, products] = await Promise.all([getCustomers(supabase), getItemOptions(supabase, ["FG"])]);
  return (
    <>
      <PageHeader title="Order Baru" back={{ href: "/orders", label: "Order Masuk" }} />
      <Card>
        <OrderForm
          id={null}
          customers={customers}
          products={products}
          initial={{ customer_id: "", customer_po: "", order_date: todayISO(), due_date: "", notes: "", lines: [] }}
        />
      </Card>
    </>
  );
}
