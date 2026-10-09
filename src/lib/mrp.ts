/**
 * MRP (Material Requirements Planning) — single-level BOM.
 *
 * Alur:
 * 1. Kebutuhan FG = sisa qty order terbuka (belum dikirim).
 * 2. Netting FG: stok FG + output WO yang masih berjalan dialokasikan ke
 *    order berdasarkan due date paling awal. Sisa yang tidak tertutup = qty
 *    yang harus diproduksi (dipegging per order).
 * 3. Explode BOM: qty produksi × komposisi BOM (+ scrap) = kebutuhan material.
 * 4. Netting material: (kebutuhan order + kebutuhan WO berjalan + safety stock)
 *    − (stok on hand + PO yang belum diterima) = kekurangan.
 * 5. Saran PO = kekurangan, dibulatkan ke MOQ & kelipatan beli.
 *
 * Fungsi di file ini murni (tanpa I/O) sehingga mudah diuji.
 */

export type MrpItem = {
  id: string;
  sku: string;
  name: string;
  item_type: "FG" | "RM" | "PKG";
  unit: string;
  cost_price: number;
  on_hand: number;
  on_order: number;
  wo_supply: number;
  wo_demand: number;
  min_stock: number;
  moq: number;
  order_multiple: number;
  lead_time_days: number;
  supplier_lead_time_days: number | null;
  default_supplier_id: string | null;
  supplier_name: string | null;
};

export type MrpOrderLine = {
  order_line_id: string;
  order_id: string;
  order_no: string;
  customer_name: string;
  status: string;
  due_date: string | null;
  item_id: string;
  qty_remaining: number;
};

export type MrpBomLine = { material_id: string; qty: number; scrap_pct: number };
export type MrpBom = { id: string; item_id: string; output_qty: number; lines: MrpBomLine[] };

export type MrpOptions = {
  /** Sertakan order DRAFT (simulasi sebelum order dikonfirmasi) */
  includeDraft: boolean;
  /** Kurangi kebutuhan produksi dengan stok FG yang ada */
  netFgStock: boolean;
  /** Tambahkan safety stock (min stock) ke kebutuhan */
  includeSafetyStock: boolean;
  /** Tanggal hari ini (YYYY-MM-DD) */
  today: string;
};

export type FgOrderAllocation = {
  order_id: string;
  order_no: string;
  customer_name: string;
  due_date: string | null;
  qty_remaining: number;
  qty_covered: number;
  qty_to_produce: number;
};

export type FgPlan = {
  item: MrpItem;
  bomId: string | null;
  demand: number;
  onHand: number;
  woSupply: number;
  safetyTopUp: number;
  netToProduce: number;
  earliestDue: string | null;
  orders: FgOrderAllocation[];
};

export type MaterialSource = {
  kind: "ORDER" | "SAFETY_FG";
  order_id: string | null;
  order_no: string | null;
  customer_name: string | null;
  fg_item_id: string;
  fg_sku: string;
  fg_qty: number;
  due_date: string | null;
  qty: number;
};

export type MaterialRequirement = {
  item: MrpItem;
  grossFromOrders: number;
  woDemand: number;
  safetyStock: number;
  totalRequired: number;
  onHand: number;
  onOrder: number;
  available: number;
  shortage: number;
  suggestedQty: number;
  leadTimeDays: number;
  requiredDate: string;
  orderByDate: string;
  isLate: boolean;
  estimatedCost: number;
  sources: MaterialSource[];
};

export type MrpResult = {
  fgPlans: FgPlan[];
  materials: MaterialRequirement[];
  missingBom: FgPlan[];
  summary: {
    openOrderCount: number;
    fgToProduceCount: number;
    materialShortageCount: number;
    lateCount: number;
    estimatedPurchase: number;
  };
};

const EPS = 1e-9;

export function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Bulatkan ke atas ke kelipatan `multiple` (0 = tanpa pembulatan). */
export function roundUpToMultiple(qty: number, multiple: number): number {
  if (!multiple || multiple <= 0) return round(qty);
  return round(Math.ceil(qty / multiple - EPS) * multiple);
}

/** Qty beli yang disarankan dari kekurangan, memperhatikan MOQ & kelipatan. */
export function suggestOrderQty(shortage: number, moq: number, multiple: number): number {
  if (shortage <= EPS) return 0;
  return roundUpToMultiple(Math.max(shortage, moq || 0), multiple);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function compareDue(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function minDate(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}

/** Kebutuhan material untuk sejumlah FG berdasarkan BOM. */
export function explodeBom(bom: MrpBom, fgQty: number): { material_id: string; qty: number }[] {
  return bom.lines.map((l) => ({
    material_id: l.material_id,
    qty: round((fgQty / bom.output_qty) * l.qty * (1 + (l.scrap_pct || 0) / 100), 6),
  }));
}

export function computeMrp(
  items: MrpItem[],
  orderLines: MrpOrderLine[],
  boms: MrpBom[],
  options: MrpOptions,
): MrpResult {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const bomByItem = new Map(boms.map((b) => [b.item_id, b]));

  const lines = orderLines.filter(
    (l) => l.qty_remaining > EPS && (options.includeDraft || l.status !== "DRAFT"),
  );

  // ---- 1-2. FG planning + alokasi stok ke order (due date terawal dulu)
  const linesByFg = new Map<string, MrpOrderLine[]>();
  for (const l of lines) {
    const arr = linesByFg.get(l.item_id) ?? [];
    arr.push(l);
    linesByFg.set(l.item_id, arr);
  }

  const fgPlans: FgPlan[] = [];
  for (const [itemId, fgLines] of linesByFg) {
    const item = itemById.get(itemId);
    if (!item) continue;
    fgLines.sort((a, b) => compareDue(a.due_date, b.due_date) || a.order_no.localeCompare(b.order_no));

    const onHand = Math.max(item.on_hand, 0);
    const woSupply = Math.max(item.wo_supply, 0);
    let supply = (options.netFgStock ? onHand : 0) + woSupply;
    const demand = round(fgLines.reduce((s, l) => s + l.qty_remaining, 0));

    // gabungkan per order (1 order bisa punya >1 baris produk yang sama)
    const byOrder = new Map<string, FgOrderAllocation>();
    let earliestDue: string | null = null;
    for (const l of fgLines) {
      const covered = Math.min(supply, l.qty_remaining);
      supply -= covered;
      const alloc = byOrder.get(l.order_id) ?? {
        order_id: l.order_id,
        order_no: l.order_no,
        customer_name: l.customer_name,
        due_date: l.due_date,
        qty_remaining: 0,
        qty_covered: 0,
        qty_to_produce: 0,
      };
      alloc.qty_remaining = round(alloc.qty_remaining + l.qty_remaining);
      alloc.qty_covered = round(alloc.qty_covered + covered);
      alloc.qty_to_produce = round(alloc.qty_to_produce + l.qty_remaining - covered);
      byOrder.set(l.order_id, alloc);
      earliestDue = minDate(earliestDue, l.due_date);
    }

    // sisa supply setelah semua order terpenuhi dipakai untuk safety stock FG
    const safetyTopUp = options.includeSafetyStock
      ? round(Math.max(0, item.min_stock - Math.max(supply, 0)))
      : 0;
    const orders = [...byOrder.values()];
    const netToProduce = round(orders.reduce((s, o) => s + o.qty_to_produce, 0) + safetyTopUp);

    fgPlans.push({
      item,
      bomId: bomByItem.get(itemId)?.id ?? null,
      demand,
      onHand,
      woSupply,
      safetyTopUp,
      netToProduce,
      earliestDue,
      orders,
    });
  }
  fgPlans.sort((a, b) => compareDue(a.earliestDue, b.earliestDue) || a.item.sku.localeCompare(b.item.sku));

  // ---- 3. Explode BOM ke material (dengan pegging ke order)
  const sourcesByMaterial = new Map<string, MaterialSource[]>();
  const pushSource = (materialId: string, s: MaterialSource) => {
    const arr = sourcesByMaterial.get(materialId) ?? [];
    arr.push(s);
    sourcesByMaterial.set(materialId, arr);
  };

  const missingBom: FgPlan[] = [];
  for (const plan of fgPlans) {
    if (plan.netToProduce <= EPS) continue;
    const bom = bomByItem.get(plan.item.id);
    if (!bom) {
      missingBom.push(plan);
      continue;
    }
    for (const o of plan.orders) {
      if (o.qty_to_produce <= EPS) continue;
      for (const m of explodeBom(bom, o.qty_to_produce)) {
        pushSource(m.material_id, {
          kind: "ORDER",
          order_id: o.order_id,
          order_no: o.order_no,
          customer_name: o.customer_name,
          fg_item_id: plan.item.id,
          fg_sku: plan.item.sku,
          fg_qty: o.qty_to_produce,
          due_date: o.due_date,
          qty: m.qty,
        });
      }
    }
    if (plan.safetyTopUp > EPS) {
      for (const m of explodeBom(bom, plan.safetyTopUp)) {
        pushSource(m.material_id, {
          kind: "SAFETY_FG",
          order_id: null,
          order_no: null,
          customer_name: null,
          fg_item_id: plan.item.id,
          fg_sku: plan.item.sku,
          fg_qty: plan.safetyTopUp,
          due_date: null,
          qty: m.qty,
        });
      }
    }
  }

  // ---- 4-5. Netting material & saran PO
  const materials: MaterialRequirement[] = [];
  for (const item of items) {
    if (item.item_type === "FG") continue;
    const sources = sourcesByMaterial.get(item.id) ?? [];
    const grossFromOrders = round(sources.reduce((s, x) => s + x.qty, 0));
    const woDemand = round(Math.max(item.wo_demand, 0));
    const safetyStock = options.includeSafetyStock ? item.min_stock : 0;
    const onHand = Math.max(item.on_hand, 0);
    const onOrder = Math.max(item.on_order, 0);
    const available = round(onHand + onOrder);
    const totalRequired = round(grossFromOrders + woDemand + safetyStock);

    // tampilkan hanya material yang relevan
    if (grossFromOrders <= EPS && woDemand <= EPS && !(safetyStock > 0 && available < safetyStock)) {
      continue;
    }

    const shortage = round(Math.max(0, totalRequired - available));
    const suggestedQty = suggestOrderQty(shortage, item.moq, item.order_multiple);
    const leadTimeDays = item.lead_time_days || item.supplier_lead_time_days || 0;
    const requiredDate =
      sources.reduce<string | null>((d, s) => minDate(d, s.due_date), null) ?? options.today;
    const orderByDate = addDays(requiredDate, -leadTimeDays);

    materials.push({
      item,
      grossFromOrders,
      woDemand,
      safetyStock,
      totalRequired,
      onHand,
      onOrder,
      available,
      shortage,
      suggestedQty,
      leadTimeDays,
      requiredDate,
      orderByDate,
      isLate: suggestedQty > 0 && orderByDate < options.today,
      estimatedCost: round(suggestedQty * item.cost_price, 2),
      sources: sources.sort((a, b) => compareDue(a.due_date, b.due_date)),
    });
  }
  materials.sort(
    (a, b) =>
      Number(b.shortage > 0) - Number(a.shortage > 0) ||
      a.orderByDate.localeCompare(b.orderByDate) ||
      a.item.sku.localeCompare(b.item.sku),
  );

  return {
    fgPlans,
    materials,
    missingBom,
    summary: {
      openOrderCount: new Set(lines.map((l) => l.order_id)).size,
      fgToProduceCount: fgPlans.filter((p) => p.netToProduce > EPS).length,
      materialShortageCount: materials.filter((m) => m.shortage > EPS).length,
      lateCount: materials.filter((m) => m.isLate).length,
      estimatedPurchase: round(materials.reduce((s, m) => s + m.estimatedCost, 0), 2),
    },
  };
}

/**
 * Kebutuhan material kotor untuk satu order (tanpa netting stok FG),
 * dibandingkan dengan stok material saat ini.
 */
export function orderMaterialNeeds(
  orderLines: { item_id: string; qty: number }[],
  boms: MrpBom[],
  items: MrpItem[],
) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const bomByItem = new Map(boms.map((b) => [b.item_id, b]));
  const totals = new Map<string, number>();
  const missingBom: string[] = [];

  for (const l of orderLines) {
    const bom = bomByItem.get(l.item_id);
    if (!bom) {
      missingBom.push(l.item_id);
      continue;
    }
    for (const m of explodeBom(bom, l.qty)) {
      totals.set(m.material_id, round((totals.get(m.material_id) ?? 0) + m.qty, 6));
    }
  }

  const rows = [...totals.entries()]
    .map(([id, qty]) => {
      const item = itemById.get(id);
      if (!item) return null;
      return {
        item,
        required: round(qty),
        onHand: item.on_hand,
        shortage: round(Math.max(0, qty - item.on_hand)),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.item.sku.localeCompare(b.item.sku));

  return { rows, missingBom };
}
