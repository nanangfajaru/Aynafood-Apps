import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { saveItem } from "@/lib/actions/master";
import { ITEM_TYPES } from "@/lib/constants";
import type { Item, PartnerOption } from "@/lib/types";

export function ItemForm({
  item,
  suppliers,
  defaultType,
}: {
  item: Item | null;
  suppliers: PartnerOption[];
  defaultType?: string;
}) {
  return (
    <ActionForm action={saveItem.bind(null, item?.id ?? null)} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="SKU / Kode *">
          <Input name="sku" defaultValue={item?.sku} required placeholder="FG-001 / RM-001" />
        </Field>
        <Field label="Nama *" className="md:col-span-2">
          <Input name="name" defaultValue={item?.name} required />
        </Field>
        <Field label="Tipe *">
          <Select name="item_type" defaultValue={item?.item_type ?? defaultType ?? "FG"}>
            {Object.entries(ITEM_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label} ({k})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Satuan *" hint="pcs, kg, gram, liter, pack, …">
          <Input name="unit" defaultValue={item?.unit ?? "pcs"} required />
        </Field>
        <Field label="Status">
          <label className="flex items-center gap-2 py-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={item?.is_active ?? true} /> Aktif
          </label>
        </Field>
      </div>

      <fieldset className="rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Harga</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Harga jual" hint="Untuk barang jadi (default harga di order/invoice)">
            <Input name="sale_price" type="number" step="any" min={0} defaultValue={item?.sale_price ?? 0} />
          </Field>
          <Field label="Harga pokok / beli" hint="Otomatis terupdate dari penerimaan PO & hasil produksi">
            <Input name="cost_price" type="number" step="any" min={0} defaultValue={item?.cost_price ?? 0} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Parameter MRP & Pembelian</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Stok minimum (safety stock)">
            <Input name="min_stock" type="number" step="any" min={0} defaultValue={item?.min_stock ?? 0} />
          </Field>
          <Field label="MOQ (min. order)" hint="Qty pembelian minimum ke supplier">
            <Input name="moq" type="number" step="any" min={0} defaultValue={item?.moq ?? 0} />
          </Field>
          <Field label="Kelipatan beli" hint="Mis. 25 jika dibeli per sak 25 kg">
            <Input name="order_multiple" type="number" step="any" min={0} defaultValue={item?.order_multiple ?? 0} />
          </Field>
          <Field label="Supplier utama">
            <Select name="default_supplier_id" defaultValue={item?.default_supplier_id ?? ""}>
              <option value="">— Tidak ada —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lead time (hari)" hint="Kosongkan/0 = pakai lead time supplier">
            <Input name="lead_time_days" type="number" min={0} defaultValue={item?.lead_time_days ?? 0} />
          </Field>
        </div>
      </fieldset>

      <Field label="Catatan">
        <Textarea name="notes" defaultValue={item?.notes ?? ""} rows={2} />
      </Field>
      <SubmitButton>Simpan</SubmitButton>
    </ActionForm>
  );
}
