import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { adjustStock } from "@/lib/actions/master";
import { todayISO } from "@/lib/format";
import { getItemStocks } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";
import { formatQty } from "@/lib/format";

export const metadata = { title: "Penyesuaian Stok" };

export default async function AdjustPage({ searchParams }: PageProps<"/inventory/adjust">) {
  const { item } = await searchParams;
  const { supabase } = await requireUser();
  const stocks = (await getItemStocks(supabase)).filter((s) => s.is_active);

  return (
    <>
      <PageHeader
        title="Penyesuaian Stok / Stock Opname"
        description="Gunakan untuk stok awal, hasil stock opname, barang rusak/hilang, atau koreksi."
        back={{ href: "/inventory", label: "Stok" }}
      />
      <Card>
        <ActionForm action={adjustStock} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Item *" className="md:col-span-2">
            <Select name="item_id" required defaultValue={typeof item === "string" ? item : ""}>
              <option value="">— Pilih item —</option>
              {stocks.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sku} · {s.name} — stok {formatQty(s.on_hand)} {s.unit}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jenis penyesuaian">
            <Select name="mode" defaultValue="SET">
              <option value="SET">Set stok fisik (hasil opname)</option>
              <option value="DELTA">Tambah / kurangi (+/−)</option>
            </Select>
          </Field>
          <Field label="Qty *" hint="Mode set: stok fisik. Mode tambah/kurang: pakai minus untuk mengurangi.">
            <Input name="qty" type="number" step="any" required />
          </Field>
          <Field label="Tanggal">
            <Input name="date" type="date" defaultValue={todayISO()} />
          </Field>
          <Field label="Harga pokok per unit (opsional)" hint="Diisi untuk stok awal agar nilai stok benar">
            <Input name="unit_cost" type="number" step="any" min={0} />
          </Field>
          <Field label="Alasan / catatan" className="md:col-span-2">
            <Input name="notes" placeholder="Stock opname bulanan, barang rusak, …" />
          </Field>
          <div className="md:col-span-2">
            <SubmitButton>Simpan Penyesuaian</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
