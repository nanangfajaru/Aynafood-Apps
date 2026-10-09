import { ItemForm } from "@/components/item-form";
import { Card, PageHeader } from "@/components/ui";
import { getSuppliers } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Item Baru" };

export default async function NewItemPage({ searchParams }: PageProps<"/items/new">) {
  const { type } = await searchParams;
  const { supabase } = await requireUser();
  const suppliers = await getSuppliers(supabase);
  return (
    <>
      <PageHeader title="Item Baru" back={{ href: "/items", label: "Produk & Material" }} />
      <Card>
        <ItemForm item={null} suppliers={suppliers} defaultType={typeof type === "string" ? type : undefined} />
      </Card>
    </>
  );
}
