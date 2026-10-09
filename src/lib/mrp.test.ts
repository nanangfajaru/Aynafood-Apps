import { describe, expect, it } from "vitest";
import {
  addDays,
  computeMrp,
  orderMaterialNeeds,
  roundUpToMultiple,
  suggestOrderQty,
  type MrpBom,
  type MrpItem,
  type MrpOrderLine,
} from "./mrp";

function item(p: Partial<MrpItem> & Pick<MrpItem, "id" | "sku" | "item_type">): MrpItem {
  return {
    name: p.sku,
    unit: "pcs",
    cost_price: 0,
    on_hand: 0,
    on_order: 0,
    wo_supply: 0,
    wo_demand: 0,
    min_stock: 0,
    moq: 0,
    order_multiple: 0,
    lead_time_days: 0,
    supplier_lead_time_days: null,
    default_supplier_id: null,
    supplier_name: null,
    ...p,
  };
}

const TODAY = "2026-10-09";

const items: MrpItem[] = [
  item({ id: "kt250", sku: "FG-KT250", item_type: "FG", on_hand: 40, min_stock: 20 }),
  item({ id: "kt500", sku: "FG-KT500", item_type: "FG", on_hand: 0, min_stock: 10 }),
  item({ id: "tmp", sku: "RM-TMP", item_type: "RM", on_hand: 50, moq: 10, order_multiple: 5, cost_price: 14000, lead_time_days: 3 }),
  item({ id: "myk", sku: "RM-MYK", item_type: "RM", on_hand: 20, moq: 18, order_multiple: 18 }),
  item({ id: "tpg", sku: "RM-TPG", item_type: "RM", on_hand: 3, moq: 5, order_multiple: 5 }),
  item({ id: "p250", sku: "PKG-P250", item_type: "PKG", on_hand: 250, moq: 500, order_multiple: 100, supplier_lead_time_days: 7 }),
  item({ id: "p500", sku: "PKG-P500", item_type: "PKG", on_hand: 0, moq: 500, order_multiple: 100 }),
];

const boms: MrpBom[] = [
  {
    id: "b250",
    item_id: "kt250",
    output_qty: 100,
    lines: [
      { material_id: "tmp", qty: 30, scrap_pct: 5 },
      { material_id: "myk", qty: 8, scrap_pct: 0 },
      { material_id: "tpg", qty: 4, scrap_pct: 0 },
      { material_id: "p250", qty: 100, scrap_pct: 2 },
    ],
  },
  {
    id: "b500",
    item_id: "kt500",
    output_qty: 50,
    lines: [
      { material_id: "tmp", qty: 30, scrap_pct: 5 },
      { material_id: "myk", qty: 8, scrap_pct: 0 },
      { material_id: "tpg", qty: 4, scrap_pct: 0 },
      { material_id: "p500", qty: 50, scrap_pct: 2 },
    ],
  },
];

const orderLines: MrpOrderLine[] = [
  { order_line_id: "l1", order_id: "o1", order_no: "ORD-1", customer_name: "A", status: "CONFIRMED", due_date: "2026-10-16", item_id: "kt250", qty_remaining: 300 },
  { order_line_id: "l2", order_id: "o1", order_no: "ORD-1", customer_name: "A", status: "CONFIRMED", due_date: "2026-10-16", item_id: "kt500", qty_remaining: 100 },
  { order_line_id: "l3", order_id: "o2", order_no: "ORD-2", customer_name: "B", status: "CONFIRMED", due_date: "2026-10-23", item_id: "kt250", qty_remaining: 200 },
  { order_line_id: "l4", order_id: "o3", order_no: "ORD-3", customer_name: "C", status: "DRAFT", due_date: "2026-10-12", item_id: "kt250", qty_remaining: 1000 },
];

const baseOptions = { includeDraft: false, netFgStock: true, includeSafetyStock: false, today: TODAY };

describe("helpers", () => {
  it("rounds up to multiples", () => {
    expect(roundUpToMultiple(157.9, 5)).toBe(160);
    expect(roundUpToMultiple(160, 5)).toBe(160);
    expect(roundUpToMultiple(3.3, 0)).toBe(3.3);
  });

  it("applies MOQ then multiple", () => {
    expect(suggestOrderQty(0, 10, 5)).toBe(0);
    expect(suggestOrderQty(3, 10, 5)).toBe(10);
    expect(suggestOrderQty(219.2, 500, 100)).toBe(500);
    expect(suggestOrderQty(32.8, 18, 18)).toBe(36);
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-10-02", -3)).toBe("2026-09-29");
  });
});

describe("computeMrp", () => {
  it("nets FG stock against earliest-due orders first", () => {
    const r = computeMrp(items, orderLines, boms, baseOptions);
    const kt250 = r.fgPlans.find((p) => p.item.id === "kt250")!;
    expect(kt250.demand).toBe(500);
    expect(kt250.netToProduce).toBe(460);
    expect(kt250.orders.map((o) => [o.order_no, o.qty_covered, o.qty_to_produce])).toEqual([
      ["ORD-1", 40, 260],
      ["ORD-2", 0, 200],
    ]);
    expect(r.fgPlans.find((p) => p.item.id === "kt500")!.netToProduce).toBe(100);
    expect(r.summary.openOrderCount).toBe(2);
  });

  it("explodes BOM, nets material stock and suggests PO qty", () => {
    const r = computeMrp(items, orderLines, boms, baseOptions);
    const byId = Object.fromEntries(r.materials.map((m) => [m.item.id, m]));

    // 460/100*30*1.05 + 100/50*30*1.05 = 144.9 + 63
    expect(byId.tmp.grossFromOrders).toBe(207.9);
    expect(byId.tmp.shortage).toBe(157.9);
    expect(byId.tmp.suggestedQty).toBe(160);
    expect(byId.tmp.estimatedCost).toBe(160 * 14000);
    expect(byId.tmp.requiredDate).toBe("2026-10-16");
    expect(byId.tmp.orderByDate).toBe("2026-10-13");

    expect(byId.myk.grossFromOrders).toBe(52.8);
    expect(byId.myk.suggestedQty).toBe(36);
    expect(byId.tpg.grossFromOrders).toBe(26.4);
    expect(byId.tpg.suggestedQty).toBe(25);
    expect(byId.p250.grossFromOrders).toBe(469.2);
    expect(byId.p250.suggestedQty).toBe(500);
    // lead time dari supplier dipakai bila item tidak punya lead time
    expect(byId.p250.leadTimeDays).toBe(7);

    // pegging: sumber kebutuhan per order
    expect(byId.tmp.sources.map((s) => [s.order_no, s.fg_sku, s.qty])).toEqual([
      ["ORD-1", "FG-KT250", 81.9],
      ["ORD-1", "FG-KT500", 63],
      ["ORD-2", "FG-KT250", 63],
    ]);
  });

  it("subtracts open PO and accounts for running work orders", () => {
    const withSupply = items.map((i) =>
      i.id === "tmp" ? { ...i, on_order: 100, wo_demand: 10 } : i.id === "kt250" ? { ...i, wo_supply: 60 } : i,
    );
    const r = computeMrp(withSupply, orderLines, boms, baseOptions);
    expect(r.fgPlans.find((p) => p.item.id === "kt250")!.netToProduce).toBe(400);
    const tmp = r.materials.find((m) => m.item.id === "tmp")!;
    // 400/100*31.5 + 63 = 189 ; +10 WO demand ; available 50 + 100
    expect(tmp.grossFromOrders).toBe(189);
    expect(tmp.totalRequired).toBe(199);
    expect(tmp.shortage).toBe(49);
    expect(tmp.suggestedQty).toBe(50);
  });

  it("can ignore FG stock, include drafts and safety stock", () => {
    const r = computeMrp(items, orderLines, boms, {
      ...baseOptions,
      netFgStock: false,
      includeDraft: true,
      includeSafetyStock: true,
    });
    const kt250 = r.fgPlans.find((p) => p.item.id === "kt250")!;
    // 1500 order + safety 20 (stok FG tidak dihitung)
    expect(kt250.netToProduce).toBe(1520);
    expect(kt250.orders[0].order_no).toBe("ORD-3"); // due date paling awal
  });

  it("flags late orders and FG without BOM", () => {
    const lines: MrpOrderLine[] = [
      { ...orderLines[0], due_date: "2026-10-10" },
      { order_line_id: "x", order_id: "o9", order_no: "ORD-9", customer_name: "Z", status: "CONFIRMED", due_date: null, item_id: "nobom", qty_remaining: 5 },
    ];
    const r = computeMrp([...items, item({ id: "nobom", sku: "FG-X", item_type: "FG" })], lines, boms, baseOptions);
    expect(r.missingBom.map((p) => p.item.sku)).toEqual(["FG-X"]);
    const tmp = r.materials.find((m) => m.item.id === "tmp")!;
    expect(tmp.orderByDate).toBe("2026-10-07");
    expect(tmp.isLate).toBe(true);
  });

  it("does not suggest anything when stock is sufficient", () => {
    const rich = items.map((i) => ({ ...i, on_hand: 100000 }));
    const r = computeMrp(rich, orderLines, boms, baseOptions);
    expect(r.fgPlans.every((p) => p.netToProduce === 0)).toBe(true);
    expect(r.materials).toHaveLength(0);
    expect(r.summary.materialShortageCount).toBe(0);
  });
});

describe("orderMaterialNeeds", () => {
  it("explodes an order without FG netting", () => {
    const { rows, missingBom } = orderMaterialNeeds(
      [
        { item_id: "kt250", qty: 300 },
        { item_id: "kt500", qty: 100 },
        { item_id: "nobom", qty: 1 },
      ],
      boms,
      items,
    );
    expect(missingBom).toEqual(["nobom"]);
    const tmp = rows.find((r) => r.item.id === "tmp")!;
    expect(tmp.required).toBe(157.5);
    expect(tmp.shortage).toBe(107.5);
  });
});
