"use client";

import { useMemo, useState, useTransition } from "react";
import { saveOrder, type OrderPayload } from "@/lib/actions/orders";
import { formatIDR } from "@/lib/format";
import type { ItemOption, PartnerOption } from "@/lib/types";
import { Alert, Button, Field, Input, Select, Textarea } from "./ui";

type Line = { key: number; item_id: string; qty: string; unit_price: string; notes: string };

export function OrderForm({
  id,
  initial,
  customers,
  products,
}: {
  id: string | null;
  initial: OrderPayload;
  customers: PartnerOption[];
  products: ItemOption[];
}) {
  const [h, setH] = useState({
    customer_id: initial.customer_id,
    customer_po: initial.customer_po,
    order_date: initial.order_date,
    due_date: initial.due_date,
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
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);

  function submit(status?: "DRAFT" | "CONFIRMED") {
    setError(null);
    startTransition(async () => {
      const res = await saveOrder(id, {
        ...h,
        status,
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
        <Field label="Customer *" className="md:col-span-2">
          <Select value={h.customer_id} onChange={(e) => setH({ ...h, customer_id: e.target.value })}>
            <option value="">— Pilih customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="No. PO Customer">
          <Input value={h.customer_po} onChange={(e) => setH({ ...h, customer_po: e.target.value })} />
        </Field>
        <div />
        <Field label="Tanggal order *">
          <Input type="date" value={h.order_date} onChange={(e) => setH({ ...h, order_date: e.target.value })} />
        </Field>
        <Field label="Tanggal kirim (due date)" hint="Dipakai MRP untuk prioritas & tanggal PO">
          <Input type="date" value={h.due_date} onChange={(e) => setH({ ...h, due_date: e.target.value })} />
        </Field>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Produk yang dipesan</h3>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left">Produk</th>
                <th className="w-32 px-2 py-2 text-right">Qty</th>
                <th className="w-16 px-2 py-2 text-left">Sat.</th>
                <th className="w-40 px-2 py-2 text-right">Harga</th>
                <th className="w-36 px-2 py-2 text-right">Subtotal</th>
                <th className="px-2 py-2 text-left">Catatan</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => {
                const p = byId.get(l.item_id);
                return (
                  <tr key={l.key}>
                    <td className="min-w-56 px-2 py-1.5">
                      <Select
                        value={l.item_id}
                        onChange={(e) => {
                          const np = byId.get(e.target.value);
                          update(l.key, { item_id: e.target.value, unit_price: String(np?.sale_price ?? 0) });
                        }}
                      >
                        <option value="">— Pilih produk —</option>
                        {products.map((pp) => (
                          <option key={pp.id} value={pp.id}>
                            {pp.sku} · {pp.name}
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
                    <td className="px-2 py-1.5 text-slate-500">{p?.unit}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        className="text-right"
                        value={l.unit_price}
                        onChange={(e) => update(l.key, { unit_price: e.target.value })}
                      />
                    </td>
                    <td className="num px-2 py-1.5">
                      {formatIDR((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}
                    </td>
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
        <div className="mt-2 flex items-center justify-between">
          <Button
            type="button"
            size="sm"
            onClick={() => setLines((ls) => [...ls, { key: Date.now(), item_id: "", qty: "", unit_price: "0", notes: "" }])}
          >
            + Tambah produk
          </Button>
          <div className="text-sm">
            Total: <b>{formatIDR(total)}</b>
          </div>
        </div>
      </div>

      <Field label="Catatan">
        <Textarea value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} />
      </Field>

      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {id ? (
          <Button variant="primary" onClick={() => submit()} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan Perubahan"}
          </Button>
        ) : (
          <>
            <Button variant="primary" onClick={() => submit("CONFIRMED")} disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan & Konfirmasi"}
            </Button>
            <Button onClick={() => submit("DRAFT")} disabled={pending}>
              Simpan sebagai Draft
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
