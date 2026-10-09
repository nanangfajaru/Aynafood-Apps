import { BomForm } from "@/components/bom-form";
import { Card, PageHeader } from "@/components/ui";
import { getItemOptions } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "BOM Baru" };

export default async function NewBomPage({ searchParams }: PageProps<"/bom/new">) {
  const { item } = await searchParams;
  const { supabase } = await requireUser();
  const [products, materials] = await Promise.all([
    getItemOptions(supabase, ["FG"]),
    getItemOptions(supabase, ["RM", "PKG"]),
  ]);
  return (
    <>
      <PageHeader title="BOM Baru" back={{ href: "/bom", label: "BOM" }} />
      <Card>
        <BomForm
          id={null}
          products={products}
          materials={materials}
          initial={{
            item_id: typeof item === "string" ? item : "",
            code: "",
            name: "",
            output_qty: 1,
            is_default: true,
            is_active: true,
            notes: "",
            lines: [],
          }}
        />
      </Card>
    </>
  );
}
