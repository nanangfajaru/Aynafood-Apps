"use client";

import { useMemo, useState, useTransition } from "react";
import { savePurchaseOrder, type PoPayload } from "@/lib/actions/purchasing";
import { formatIDR } from "@/lib/format";
import type { ItemOption, PartnerOption } from "@/lib/types";
import { Alert, Button, Field, Input, Select, Textarea } from "./ui";

type Line = { key: number; item_id: string; qty: string; unit_price: string; notes: string };

export function PoForm({
  id,
  initial,
  suppliers,
  items,
}: {
  id: string | null;
  initial: PoPayload;
  suppliers: PartnerOption[];
  items: ItemOption[];
}) {
  const [h, setH] = useState({
    supplier_id: initial.supplier_id,
    order_date: initial.order_date,
    expected_date: initial.expected_date,
    tax_rate: String(initial.tax_rate),
    notes: initial.notes,
  });
  const [lines, setLines] = useState<Line[]>(() =>
    (initial.lines.length ? initial.lines : [{ item_id: "", qty: 0, unit_price: 0, notes: "" }]).map((l, i) => ({
      key: i,
      item_id: l.item_id,
      qty: l.qty ? String(l.qty) : "",
      unit_price: String(l.unit_price ?? 0),
      notes: l.notes ?? "",
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const byId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items]);
  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const subtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
  const tax = Math.round((subtotal * (Number(h.tax_rate) || 0)) / 100);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await savePurchaseOrder(id, {
        ...h,
        tax_rate: Number(h.tax_rate) || 0,
        lines: lines.map((l) => ({
          item_id: l.item_id,
          qty: Number(l.qty) || 0,
          unit_price: Number(l.unit_price) || 0,
          notes: l.notes,
        })),
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Field label="Supplier *" className="md:col-span-2">
          <Select value={h.supplier_id} onChange={(e) => setH({ ...h, supplier_id: e.target.value })}>
            <option value="">— Pilih supplier —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tanggal PO">
          <Input type="date" value={h.order_date} onChange={(e) => setH({ ...h, order_date: e.target.value })} />
        </Field>
        <Field label="Estimasi datang">
          <Input type="date" value={h.expected_date} onChange={(e) => setH({ ...h, expected_date: e.target.value })} />
        </Field>
        <Field label="PPN (%)" hint="0 jika supplier non-PKP">
          <Input type="number" step="any" min={0} value={h.tax_rate} onChange={(e) => setH({ ...h, tax_rate: e.target.value })} />
        </Field>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Item</th>
              <th className="w-32 px-2 py-2 text-right">Qty</th>
              <th className="w-16 px-2 py-2 text-left">Sat.</th>
              <th className="w-40 px-2 py-2 text-right">Harga</th>
              <th className="w-36 px-2 py-2 text-right">Subtotal</th>
              <th className="px-2 py-2 text-left">Catatan</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => (
              <tr key={l.key}>
                <td className="min-w-56 px-2 py-1.5">
                  <Select
                    value={l.item_id}
                    onChange={(e) =>
                      update(l.key, {
                        item_id: e.target.value,
                        unit_price: String(byId.get(e.target.value)?.cost_price ?? 0),
                      })
                    }
                  >
                    <option value="">— Pilih item —</option>
                    {items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} · {p.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-2 py-1.5">
                  <Input type="number" step="any" min={0} className="text-right" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
                </td>
                <td className="px-2 py-1.5 text-slate-500">{byId.get(l.item_id)?.unit}</td>
                <td className="px-2 py-1.5">
                  <Input type="number" step="any" min={0} className="text-right" value={l.unit_price} onChange={(e) => update(l.key, { unit_price: e.target.value })} />
                </td>
                <td className="num px-2 py-1.5">{formatIDR((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</td>
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
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Button
          type="button"
          size="sm"
          onClick={() => setLines((ls) => [...ls, { key: Date.now(), item_id: "", qty: "", unit_price: "0", notes: "" }])}
        >
          + Tambah item
        </Button>
        <dl className="w-64 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="num">{formatIDR(subtotal)}</dd></div>
          <div className="flex justify-between"><dt>PPN {h.tax_rate}%</dt><dd className="num">{formatIDR(tax)}</dd></div>
          <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd className="num">{formatIDR(subtotal + tax)}</dd></div>
        </dl>
      </div>

      <Field label="Catatan">
        <Textarea value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} />
      </Field>
      {error && <Alert>{error}</Alert>}
      <Button variant="primary" onClick={submit} disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan PO"}
      </Button>
    </div>
  );
}
