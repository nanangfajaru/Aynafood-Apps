import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-form";
import { ItemForm } from "@/components/item-form";
import { Card, DescList, LinkButton, PageHeader } from "@/components/ui";
import { deleteItem } from "@/lib/actions/master";
import { formatIDR, formatQty } from "@/lib/format";
import { getSuppliers } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";
import type { Item, ItemStock } from "@/lib/types";

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: item }, { data: stock }, suppliers] = await Promise.all([
    supabase.from("items").select("*").eq("id", id).maybeSingle<Item>(),
    supabase.from("v_item_stock").select("*").eq("id", id).maybeSingle<ItemStock>(),
    getSuppliers(supabase),
  ]);
  if (!item) notFound();

  return (
    <>
      <PageHeader
        title={`${item.sku} · ${item.name}`}
        back={{ href: `/items?type=${item.item_type}`, label: "Produk & Material" }}
        actions={
          <>
            <LinkButton href={`/inventory/movements?item=${item.id}`}>Kartu Stok</LinkButton>
            {item.item_type === "FG" && <LinkButton href={`/bom?item=${item.id}`}>BOM</LinkButton>}
            <ActionButton action={deleteItem.bind(null, item.id)} confirmText="Hapus item ini?" variant="danger">
              Hapus
            </ActionButton>
          </>
        }
      />
      {stock && (
        <Card className="mb-4">
          <DescList
            items={[
              { label: "Stok on hand", value: `${formatQty(stock.on_hand)} ${item.unit}` },
              { label: "Sedang dipesan (PO)", value: formatQty(stock.on_order) },
              {
                label: item.item_type === "FG" ? "Dalam produksi (WO)" : "Dialokasikan ke WO",
                value: formatQty(item.item_type === "FG" ? stock.wo_supply : stock.wo_demand),
              },
              { label: "Nilai stok", value: formatIDR(stock.stock_value) },
            ]}
          />
        </Card>
      )}
      <Card>
        <ItemForm item={item} suppliers={suppliers} />
      </Card>
    </>
  );
}
