import { notFound, redirect } from "next/navigation";
import { PoForm } from "@/components/po-form";
import { Card, PageHeader } from "@/components/ui";
import { getItemOptions, getSuppliers } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export default async function EditPoPage({ params }: PageProps<"/purchase-orders/[id]/edit">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: po }, suppliers, items] = await Promise.all([
    supabase.from("purchase_orders").select("*, po_lines(*)").eq("id", id).maybeSingle(),
    getSuppliers(supabase),
    getItemOptions(supabase, ["RM", "PKG"]),
  ]);
  if (!po) notFound();
  if (po.status !== "DRAFT") redirect(`/purchase-orders/${id}`);
  const lines = [...po.po_lines].sort((a, b) => a.sort - b.sort);

  return (
    <>
      <PageHeader title={`Ubah ${po.po_no}`} back={{ href: `/purchase-orders/${id}`, label: po.po_no }} />
      <Card>
        <PoForm
          id={id}
          suppliers={suppliers}
          items={items}
          initial={{
            supplier_id: po.supplier_id,
            order_date: po.order_date,
            expected_date: po.expected_date ?? "",
            tax_rate: po.tax_rate,
            notes: po.notes ?? "",
            lines: lines.map((l) => ({ item_id: l.item_id, qty: l.qty, unit_price: l.unit_price, notes: l.notes ?? "" })),
          }}
        />
      </Card>
    </>
  );
}
