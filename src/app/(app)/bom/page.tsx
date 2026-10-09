import Link from "next/link";
import { Badge, Card, EmptyRow, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatQty } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "BOM" };

type BomRow = {
  id: string;
  code: string;
  name: string | null;
  output_qty: number;
  is_default: boolean;
  is_active: boolean;
  item: { id: string; sku: string; name: string; unit: string } | null;
  bom_lines: { count: number }[];
};

export default async function BomListPage({ searchParams }: PageProps<"/bom">) {
  const { item } = await searchParams;
  const { supabase } = await requireUser();
  let q = supabase
    .from("boms")
    .select("id, code, name, output_qty, is_default, is_active, item:items(id, sku, name, unit), bom_lines(count)")
    .order("code");
  if (typeof item === "string") q = q.eq("item_id", item);
  const { data } = await q.returns<BomRow[]>();
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="BOM / Resep"
        description="Komposisi material untuk setiap barang jadi (single-level). Dipakai MRP & Work Order."
        actions={
          <LinkButton href={`/bom/new${typeof item === "string" ? `?item=${item}` : ""}`} variant="primary">
            + BOM Baru
          </LinkButton>
        }
      />
      <Card bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Kode</Th>
              <Th>Produk</Th>
              <Th>Nama / Versi</Th>
              <Th className="text-right">Output / batch</Th>
              <Th className="text-right">Jml Material</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <EmptyRow colSpan={6}>Belum ada BOM</EmptyRow>}
            {rows.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/bom/${b.id}`} className="font-medium text-brand-700 hover:underline">
                    {b.code}
                  </Link>
                </Td>
                <Td>
                  {b.item?.sku} · {b.item?.name}
                </Td>
                <Td>{b.name ?? "-"}</Td>
                <Td className="num">
                  {formatQty(b.output_qty)} {b.item?.unit}
                </Td>
                <Td className="num">{b.bom_lines[0]?.count ?? 0}</Td>
                <Td className="space-x-1">
                  {b.is_default && <Badge tone="violet">Default</Badge>}
                  {b.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
