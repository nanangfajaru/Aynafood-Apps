import { PoForm } from "@/components/po-form";
import { Card, PageHeader } from "@/components/ui";
import { todayISO } from "@/lib/format";
import { getItemOptions, getSuppliers } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "PO Baru" };

export default async function NewPoPage() {
  const { supabase } = await requireUser();
  const [suppliers, items] = await Promise.all([getSuppliers(supabase), getItemOptions(supabase, ["RM", "PKG"])]);
  return (
    <>
      <PageHeader title="Purchase Order Baru" back={{ href: "/purchase-orders", label: "Purchase Order" }} />
      <Card>
        <PoForm
          id={null}
          suppliers={suppliers}
          items={items}
          initial={{ supplier_id: "", order_date: todayISO(), expected_date: "", tax_rate: 0, notes: "", lines: [] }}
        />
      </Card>
    </>
  );
}
