"use client";

import { useMemo, useState, useTransition } from "react";
import { saveBom, type BomPayload } from "@/lib/actions/bom";
import { formatIDR, formatQty } from "@/lib/format";
import type { ItemOption } from "@/lib/types";
import { Alert, Button, Field, Input, Select, Textarea } from "./ui";

type Line = { key: number; material_id: string; qty: string; scrap_pct: string; notes: string };

export function BomForm({
  id,
  initial,
  products,
  materials,
}: {
  id: string | null;
  initial: BomPayload;
  products: ItemOption[];
  materials: ItemOption[];
}) {
  const [header, setHeader] = useState({
    item_id: initial.item_id,
    code: initial.code,
    name: initial.name,
    output_qty: String(initial.output_qty),
    is_default: initial.is_default,
    is_active: initial.is_active,
    notes: initial.notes,
  });
  const [lines, setLines] = useState<Line[]>(() =>
    (initial.lines.length ? initial.lines : [{ material_id: "", qty: 0, scrap_pct: 0, notes: "" }]).map((l, i) => ({
      key: i,
      material_id: l.material_id,
      qty: l.qty ? String(l.qty) : "",
      scrap_pct: String(l.scrap_pct ?? 0),
      notes: l.notes ?? "",
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const product = products.find((p) => p.id === header.item_id);

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const outputQty = Number(header.output_qty) || 0;
  const batchCost = lines.reduce((sum, l) => {
    const m = matById.get(l.material_id);
    const q = Number(l.qty) || 0;
    return sum + (m ? q * (1 + (Number(l.scrap_pct) || 0) / 100) * m.cost_price : 0);
  }, 0);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await saveBom(id, {
        ...header,
        output_qty: outputQty,
        lines: lines.map((l) => ({
          material_id: l.material_id,
          qty: Number(l.qty) || 0,
          scrap_pct: Number(l.scrap_pct) || 0,
          notes: l.notes,
        })),
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Produk (Barang Jadi) *" className="md:col-span-2">
          <Select value={header.item_id} onChange={(e) => setHeader({ ...header, item_id: e.target.value })}>
            <option value="">— Pilih produk —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Kode BOM" hint="Kosongkan untuk otomatis">
          <Input value={header.code} onChange={(e) => setHeader({ ...header, code: e.target.value })} />
        </Field>
        <Field label="Nama / versi resep">
          <Input value={header.name} onChange={(e) => setHeader({ ...header, name: e.target.value })} placeholder="Resep standar" />
        </Field>
        <Field label={`Qty output per batch *`} hint={`Hasil ${product?.unit ?? "unit"} dari komposisi di bawah`}>
          <Input
            type="number"
            step="any"
            min={0}
            value={header.output_qty}
            onChange={(e) => setHeader({ ...header, output_qty: e.target.value })}
          />
        </Field>
        <div className="flex items-end gap-6 pb-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={header.is_default}
              onChange={(e) => setHeader({ ...header, is_default: e.target.checked })}
            />
            BOM default
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={header.is_active}
              onChange={(e) => setHeader({ ...header, is_active: e.target.checked })}
            />
            Aktif
          </label>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Komposisi Material</h3>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left">Material</th>
                <th className="w-32 px-2 py-2 text-right">Qty</th>
                <th className="w-16 px-2 py-2 text-left">Sat.</th>
                <th className="w-24 px-2 py-2 text-right">Scrap %</th>
                <th className="w-32 px-2 py-2 text-right">Per 1 {product?.unit ?? "unit"}</th>
                <th className="w-32 px-2 py-2 text-right">Biaya</th>
                <th className="px-2 py-2 text-left">Catatan</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => {
                const m = matById.get(l.material_id);
                const gross = (Number(l.qty) || 0) * (1 + (Number(l.scrap_pct) || 0) / 100);
                return (
                  <tr key={l.key}>
                    <td className="px-2 py-1.5">
                      <Select value={l.material_id} onChange={(e) => update(l.key, { material_id: e.target.value })}>
                        <option value="">— Pilih material —</option>
                        {materials.map((mm) => (
                          <option key={mm.id} value={mm.id}>
                            {mm.sku} · {mm.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        className="text-right"
                        value={l.qty}
                        onChange={(e) => update(l.key, { qty: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-slate-500">{m?.unit ?? ""}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        max={99}
                        className="text-right"
                        value={l.scrap_pct}
                        onChange={(e) => update(l.key, { scrap_pct: e.target.value })}
                      />
                    </td>
                    <td className="num px-2 py-1.5 text-slate-500">
                      {outputQty > 0 ? formatQty(gross / outputQty) : "-"}
                    </td>
                    <td className="num px-2 py-1.5 text-slate-500">{m ? formatIDR(gross * m.cost_price) : "-"}</td>
                    <td className="px-2 py-1.5">
                      <Input value={l.notes} onChange={(e) => update(l.key, { notes: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        aria-label="Hapus baris"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() =>
              setLines((ls) => [...ls, { key: Date.now(), material_id: "", qty: "", scrap_pct: "0", notes: "" }])
            }
          >
            + Tambah material
          </Button>
          <div className="text-sm text-slate-600">
            Biaya material per batch: <b>{formatIDR(batchCost)}</b> · HPP material per {product?.unit ?? "unit"}:{" "}
            <b>{outputQty > 0 ? formatIDR(batchCost / outputQty) : "-"}</b>
          </div>
        </div>
      </div>

      <Field label="Catatan / instruksi produksi">
        <Textarea value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} />
      </Field>

      {error && <Alert>{error}</Alert>}
      <Button variant="primary" onClick={submit} disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan BOM"}
      </Button>
    </div>
  );
}
