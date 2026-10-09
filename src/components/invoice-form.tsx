"use client";

import { useMemo, useState, useTransition } from "react";
import { saveInvoice, type InvoicePayload } from "@/lib/actions/invoices";
import { addDays } from "@/lib/mrp";
import { formatIDR } from "@/lib/format";
import type { ItemOption, PartnerOption } from "@/lib/types";
import { Alert, Button, Field, Input, Select, Textarea } from "./ui";

type Line = {
  key: number;
  item_id: string;
  description: string;
  qty: string;
  unit: string;
  unit_price: string;
  discount_pct: string;
};

function lineTotal(l: Line) {
  return (Number(l.qty) || 0) * (Number(l.unit_price) || 0) * (1 - (Number(l.discount_pct) || 0) / 100);
}

export function InvoiceForm({
  id,
  initial,
  customers,
  items,
  orderLabel,
}: {
  id: string | null;
  initial: InvoicePayload;
  customers: PartnerOption[];
  items: ItemOption[];
  orderLabel?: string;
}) {
  const [h, setH] = useState({
    customer_id: initial.customer_id,
    invoice_date: initial.invoice_date,
    due_date: initial.due_date,
    tax_rate: String(initial.tax_rate),
    discount_amount: String(initial.discount_amount),
    deduct_stock: initial.deduct_stock,
    notes: initial.notes,
  });
  const [lines, setLines] = useState<Line[]>(() =>
    (initial.lines.length
      ? initial.lines
      : [{ item_id: null, description: "", qty: 1, unit: "pcs", unit_price: 0, discount_pct: 0 }]
    ).map((l, i) => ({
      key: i,
      item_id: l.item_id ?? "",
      description: l.description,
      qty: String(l.qty),
      unit: l.unit ?? "",
      unit_price: String(l.unit_price),
      discount_pct: String(l.discount_pct ?? 0),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const byId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items]);
  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const subtotal = Math.round(lines.reduce((s, l) => s + lineTotal(l), 0) * 100) / 100;
  const discount = Number(h.discount_amount) || 0;
  const dpp = subtotal - discount;
  const tax = Math.round((dpp * (Number(h.tax_rate) || 0)) / 100);
  const fromOrder = Boolean(initial.order_id);

  function onCustomer(customerId: string) {
    const c = customers.find((x) => x.id === customerId);
    setH((prev) => ({
      ...prev,
      customer_id: customerId,
      due_date: c?.payment_terms != null ? addDays(prev.invoice_date, c.payment_terms) : prev.due_date,
    }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await saveInvoice(id, {
        ...h,
        order_id: initial.order_id,
        tax_rate: Number(h.tax_rate) || 0,
        discount_amount: discount,
        deduct_stock: fromOrder ? false : h.deduct_stock,
        lines: lines.map((l) => ({
          item_id: l.item_id || null,
          description: l.description,
          qty: Number(l.qty) || 0,
          unit: l.unit,
          unit_price: Number(l.unit_price) || 0,
          discount_pct: Number(l.discount_pct) || 0,
        })),
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      {orderLabel && <Alert tone="blue">Invoice ini ditautkan ke order {orderLabel}. Stok berkurang lewat pengiriman order, bukan dari invoice.</Alert>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Field label="Customer *" className="md:col-span-2">
          <Select value={h.customer_id} onChange={(e) => onCustomer(e.target.value)} disabled={fromOrder}>
            <option value="">— Pilih customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tanggal invoice">
          <Input type="date" value={h.invoice_date} onChange={(e) => setH({ ...h, invoice_date: e.target.value })} />
        </Field>
        <Field label="Jatuh tempo">
          <Input type="date" value={h.due_date} onChange={(e) => setH({ ...h, due_date: e.target.value })} />
        </Field>
        <Field label="PPN (%)">
          <Input type="number" step="any" min={0} value={h.tax_rate} onChange={(e) => setH({ ...h, tax_rate: e.target.value })} />
        </Field>
        {!fromOrder && (
          <div className="flex items-end pb-2 md:col-span-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={h.deduct_stock}
                onChange={(e) => setH({ ...h, deduct_stock: e.target.checked })}
              />
              Kurangi stok saat invoice diterbitkan (penjualan langsung tanpa order)
            </label>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Produk (opsional)</th>
              <th className="px-2 py-2 text-left">Deskripsi *</th>
              <th className="w-24 px-2 py-2 text-right">Qty</th>
              <th className="w-20 px-2 py-2 text-left">Sat.</th>
              <th className="w-36 px-2 py-2 text-right">Harga</th>
              <th className="w-20 px-2 py-2 text-right">Disc %</th>
              <th className="w-36 px-2 py-2 text-right">Jumlah</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => (
              <tr key={l.key}>
                <td className="min-w-48 px-2 py-1.5">
                  <Select
                    value={l.item_id}
                    onChange={(e) => {
                      const p = byId.get(e.target.value);
                      update(l.key, p
                        ? { item_id: p.id, description: p.name, unit: p.unit, unit_price: String(p.sale_price) }
                        : { item_id: "" });
                    }}
                  >
                    <option value="">— Jasa / lainnya —</option>
                    {items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} · {p.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="min-w-56 px-2 py-1.5">
                  <Input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="number" step="any" min={0} className="text-right" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
                </td>
                <td className="px-2 py-1.5">
                  <Input value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="number" step="any" min={0} className="text-right" value={l.unit_price} onChange={(e) => update(l.key, { unit_price: e.target.value })} />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="number" step="any" min={0} max={100} className="text-right" value={l.discount_pct} onChange={(e) => update(l.key, { discount_pct: e.target.value })} />
                </td>
                <td className="num px-2 py-1.5">{formatIDR(lineTotal(l))}</td>
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
          onClick={() =>
            setLines((ls) => [
              ...ls,
              { key: Date.now(), item_id: "", description: "", qty: "1", unit: "pcs", unit_price: "0", discount_pct: "0" },
            ])
          }
        >
          + Tambah baris
        </Button>
        <dl className="w-72 space-y-1.5 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="num">{formatIDR(subtotal)}</dd></div>
          <div className="flex items-center justify-between gap-2">
            <dt>Diskon</dt>
            <dd>
              <Input type="number" step="any" min={0} className="w-36 py-1 text-right" value={h.discount_amount} onChange={(e) => setH({ ...h, discount_amount: e.target.value })} />
            </dd>
          </div>
          <div className="flex justify-between"><dt>DPP</dt><dd className="num">{formatIDR(dpp)}</dd></div>
          <div className="flex justify-between"><dt>PPN {h.tax_rate}%</dt><dd className="num">{formatIDR(tax)}</dd></div>
          <div className="flex justify-between border-t pt-1.5 text-base font-semibold"><dt>Total</dt><dd className="num">{formatIDR(dpp + tax)}</dd></div>
        </dl>
      </div>

      <Field label="Catatan (tampil di invoice)">
        <Textarea value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} />
      </Field>
      {error && <Alert>{error}</Alert>}
      <Button variant="primary" onClick={submit} disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan Invoice (Draft)"}
      </Button>
    </div>
  );
}
