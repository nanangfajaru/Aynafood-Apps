import Link from "next/link";
import { Badge, Card, EmptyRow, LinkButton, PageHeader, Stat, Table, TabLinks, Td, Th } from "@/components/ui";
import { ITEM_TYPES } from "@/lib/constants";
import { formatIDR, formatQty } from "@/lib/format";
import { getItemStocks } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Stok" };

const TABS = {
  FG: { label: "Barang Jadi (FG)", types: ["FG"] },
  MATERIAL: { label: "Bahan Baku & Kemasan", types: ["RM", "PKG"] },
  LOW: { label: "Di Bawah Minimum", types: ["FG", "RM", "PKG"] },
} as const;

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" && sp.tab in TABS ? sp.tab : "FG") as keyof typeof TABS;
  const { supabase } = await requireUser();
  const all = (await getItemStocks(supabase)).filter((s) => s.is_active || s.on_hand !== 0);
  const types: readonly string[] = TABS[tab].types;
  const rows = all.filter(
    (s) => types.includes(s.item_type) && (tab !== "LOW" || (s.min_stock > 0 && s.on_hand < s.min_stock)),
  );

  const valueFg = all.filter((s) => s.item_type === "FG").reduce((a, s) => a + s.stock_value, 0);
  const valueMat = all.filter((s) => s.item_type !== "FG").reduce((a, s) => a + s.stock_value, 0);
  const lowCount = all.filter((s) => s.min_stock > 0 && s.on_hand < s.min_stock).length;
  const isFg = tab === "FG";

  return (
    <>
      <PageHeader
        title="Stok"
        description="Posisi stok saat ini. Semua perubahan tercatat di kartu stok."
        actions={
          <>
            <LinkButton href="/inventory/movements">Kartu Stok</LinkButton>
            <LinkButton href="/inventory/adjust" variant="primary">
              Penyesuaian / Opname
            </LinkButton>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Nilai stok barang jadi" value={formatIDR(valueFg)} tone="violet" />
        <Stat label="Nilai stok material" value={formatIDR(valueMat)} tone="blue" />
        <Stat label="Item di bawah minimum" value={lowCount} tone={lowCount ? "red" : "green"} href="/inventory?tab=LOW" />
      </div>
      <TabLinks
        active={tab}
        tabs={Object.entries(TABS).map(([k, v]) => ({ key: k, label: v.label, href: `/inventory?tab=${k}` }))}
      />
      <Card bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Tipe</Th>
              <Th className="text-right">On Hand</Th>
              <Th className="text-right">Min</Th>
              {isFg ? <Th className="text-right">Dalam Produksi</Th> : <Th className="text-right">Dialokasikan WO</Th>}
              {!isFg && <Th className="text-right">PO Berjalan</Th>}
              <Th className="text-right">{isFg ? "Proyeksi" : "Tersedia"}</Th>
              <Th className="text-right">HPP</Th>
              <Th className="text-right">Nilai</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <EmptyRow colSpan={10}>Tidak ada data</EmptyRow>}
            {rows.map((s) => {
              const projected =
                s.item_type === "FG" ? s.on_hand + s.wo_supply : s.on_hand - s.wo_demand + s.on_order;
              const low = s.min_stock > 0 && s.on_hand < s.min_stock;
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/inventory/movements?item=${s.id}`} className="font-medium text-brand-700 hover:underline">
                      {s.sku}
                    </Link>{" "}
                    {s.name}
                  </Td>
                  <Td>
                    <Badge tone={ITEM_TYPES[s.item_type].tone}>{ITEM_TYPES[s.item_type].label}</Badge>
                  </Td>
                  <Td className={`num font-semibold ${s.on_hand <= 0 ? "text-red-600" : ""}`}>
                    {formatQty(s.on_hand)} {s.unit}
                  </Td>
                  <Td className="num">{formatQty(s.min_stock)}</Td>
                  <Td className="num">{formatQty(s.item_type === "FG" ? s.wo_supply : s.wo_demand)}</Td>
                  {!isFg && <Td className="num">{formatQty(s.on_order)}</Td>}
                  <Td className={`num ${projected < 0 ? "text-red-600" : ""}`}>{formatQty(projected)}</Td>
                  <Td className="num">{formatIDR(s.cost_price)}</Td>
                  <Td className="num">{formatIDR(s.stock_value)}</Td>
                  <Td>
                    {s.on_hand <= 0 ? (
                      <Badge tone="red">Habis</Badge>
                    ) : low ? (
                      <Badge tone="amber">Di bawah min</Badge>
                    ) : (
                      <Badge tone="green">Aman</Badge>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        {isFg
          ? "Proyeksi = on hand + WO yang sedang berjalan."
          : "Tersedia = on hand − kebutuhan WO berjalan + PO yang belum diterima."}
      </p>
    </>
  );
}
