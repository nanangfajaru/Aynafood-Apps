import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-form";
import { BomForm } from "@/components/bom-form";
import { Card, PageHeader } from "@/components/ui";
import { deleteBom } from "@/lib/actions/bom";
import { getItemOptions } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export default async function BomPage({ params }: PageProps<"/bom/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: bom }, products, materials] = await Promise.all([
    supabase.from("boms").select("*, bom_lines(*)").eq("id", id).maybeSingle(),
    getItemOptions(supabase, ["FG"]),
    getItemOptions(supabase, ["RM", "PKG"]),
  ]);
  if (!bom) notFound();
  const lines = [...(bom.bom_lines ?? [])].sort((a, b) => a.sort - b.sort);

  return (
    <>
      <PageHeader
        title={`BOM ${bom.code}`}
        back={{ href: "/bom", label: "BOM" }}
        actions={
          <ActionButton action={deleteBom.bind(null, bom.id)} confirmText="Hapus BOM ini?" variant="danger">
            Hapus
          </ActionButton>
        }
      />
      <Card>
        <BomForm
          id={bom.id}
          products={products}
          materials={materials}
          initial={{
            item_id: bom.item_id,
            code: bom.code,
            name: bom.name ?? "",
            output_qty: bom.output_qty,
            is_default: bom.is_default,
            is_active: bom.is_active,
            notes: bom.notes ?? "",
            lines: lines.map((l) => ({
              material_id: l.material_id,
              qty: l.qty,
              scrap_pct: l.scrap_pct,
              notes: l.notes ?? "",
            })),
          }}
        />
      </Card>
    </>
  );
}
