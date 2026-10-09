export type Tone = "gray" | "blue" | "amber" | "green" | "red" | "violet";

export const ITEM_TYPES = {
  FG: { label: "Barang Jadi", tone: "violet" },
  RM: { label: "Bahan Baku", tone: "blue" },
  PKG: { label: "Kemasan", tone: "amber" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export type ItemType = keyof typeof ITEM_TYPES;

export const ORDER_STATUS = {
  DRAFT: { label: "Draft", tone: "gray" },
  CONFIRMED: { label: "Dikonfirmasi", tone: "blue" },
  IN_PRODUCTION: { label: "Produksi", tone: "violet" },
  PARTIAL: { label: "Terkirim Sebagian", tone: "amber" },
  DELIVERED: { label: "Selesai", tone: "green" },
  CANCELLED: { label: "Batal", tone: "red" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const WO_STATUS = {
  PLANNED: { label: "Direncanakan", tone: "gray" },
  IN_PROGRESS: { label: "Diproses", tone: "blue" },
  COMPLETED: { label: "Selesai", tone: "green" },
  CANCELLED: { label: "Batal", tone: "red" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const PO_STATUS = {
  DRAFT: { label: "Draft", tone: "gray" },
  ORDERED: { label: "Dipesan", tone: "blue" },
  PARTIAL: { label: "Diterima Sebagian", tone: "amber" },
  RECEIVED: { label: "Diterima", tone: "green" },
  CANCELLED: { label: "Batal", tone: "red" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const INVOICE_STATUS = {
  DRAFT: { label: "Draft", tone: "gray" },
  ISSUED: { label: "Belum Dibayar", tone: "blue" },
  PARTIAL: { label: "Dibayar Sebagian", tone: "amber" },
  PAID: { label: "Lunas", tone: "green" },
  VOID: { label: "Void", tone: "red" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const MOVEMENT_TYPES: Record<string, string> = {
  OPENING: "Stok Awal",
  ADJUSTMENT: "Penyesuaian",
  PURCHASE_RECEIPT: "Penerimaan PO",
  PRODUCTION_CONSUME: "Pemakaian Produksi",
  PRODUCTION_OUTPUT: "Hasil Produksi",
  DELIVERY: "Pengiriman",
  INVOICE: "Penjualan (Invoice)",
  INVOICE_VOID: "Void Invoice",
};

export const PAYMENT_METHODS = ["TRANSFER", "TUNAI", "GIRO", "QRIS", "LAINNYA"] as const;

export function statusMeta(
  map: Record<string, { label: string; tone: Tone }>,
  status: string,
): { label: string; tone: Tone } {
  return map[status] ?? { label: status, tone: "gray" };
}
