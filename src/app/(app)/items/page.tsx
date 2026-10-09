import Link from "next/link";
import { Badge, Card, EmptyRow, Input, LinkButton, PageHeader, Table, TabLinks, Td, Th } from "@/components/ui";
import { ITEM_TYPES } from "@/lib/constants";
import { formatIDR, formatQty, searchTerm } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import type { ItemStock } from "@/lib/types";

export const metadata = { title: "Produk & Material" };

export default async function ItemsPage({ searchParams }: PageProps<"/items">) {
  const sp = await searchParams;
  const type = typeof sp.type === "string" && sp.type in ITEM_TYPES ? sp.type : "ALL";
  const q = searchTerm(sp.q);
  const { supabase } = await requireUser();

  let query = supabase.from("v_item_stock").select("*").order("sku");
  if (type !== "ALL") query = query.eq("item_type", type);
  if (q) query = query.or(`sku.ilike.%${q}%,name.ilike.%${q}%`);
  const { data } = await query;
  const rows = (data ?? []) as ItemStock[];

  return (
    <>
      <PageHeader
        title="Produk & Material"
        description="Master barang jadi (FG), bahan baku (RM) dan kemasan (PKG)"
        actions={
          <LinkButton href={`/items/new${type !== "ALL" ? `?type=${type}` : ""}`} variant="primary">
            + Item Baru
          </LinkButton>
        }
      />
      <TabLinks
        active={type}
        tabs={[
          { key: "ALL", label: "Semua", href: "/items" },
          ...Object.entries(ITEM_TYPES).map(([k, v]) => ({ key: k, label: v.label, href: `/items?type=${k}` })),
        ]}
      />
      <Card bodyClassName="p-0">
        <form className="border-b border-slate-200 p-3">
          {type !== "ALL" && <input type="hidden" name="type" value={type} />}
          <Input name="q" defaultValue={q} placeholder="Cari SKU atau nama…" className="max-w-xs" />
        </form>
        <Table>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Nama</Th>
              <Th>Tipe</Th>
              <Th>Satuan</Th>
              <Th className="text-right">Harga Jual</Th>
              <Th className="text-right">Harga Pokok</Th>
              <Th className="text-right">Stok</Th>
              <Th className="text-right">Min</Th>
              <Th>Supplier</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <EmptyRow colSpan={9}>Belum ada item</EmptyRow>}
            {rows.map((r) => (
              <tr key={r.id} className={r.is_active ? "hover:bg-slate-50" : "opacity-50"}>
                <Td>
                  <Link href={`/items/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.sku}
                  </Link>
                </Td>
                <Td>{r.name}</Td>
                <Td>
                  <Badge tone={ITEM_TYPES[r.item_type].tone}>{ITEM_TYPES[r.item_type].label}</Badge>
                </Td>
                <Td>{r.unit}</Td>
                <Td className="num">{r.item_type === "FG" ? formatIDR(r.sale_price) : "-"}</Td>
                <Td className="num">{formatIDR(r.cost_price)}</Td>
                <Td className={`num ${r.on_hand < r.min_stock ? "font-semibold text-red-600" : ""}`}>
                  {formatQty(r.on_hand)}
                </Td>
                <Td className="num">{formatQty(r.min_stock)}</Td>
                <Td>{r.supplier_name ?? "-"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
