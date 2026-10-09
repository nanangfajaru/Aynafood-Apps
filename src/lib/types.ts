import type { ItemType } from "./constants";

export type Partner = {
  id: string;
  code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  npwp: string | null;
  notes: string | null;
  is_active: boolean;
  payment_terms?: number;
  lead_time_days?: number;
};

export type Item = {
  id: string;
  sku: string;
  name: string;
  item_type: ItemType;
  unit: string;
  sale_price: number;
  cost_price: number;
  min_stock: number;
  moq: number;
  order_multiple: number;
  lead_time_days: number;
  default_supplier_id: string | null;
  notes: string | null;
  is_active: boolean;
};

export type ItemStock = {
  id: string;
  sku: string;
  name: string;
  item_type: ItemType;
  unit: string;
  sale_price: number;
  cost_price: number;
  min_stock: number;
  moq: number;
  order_multiple: number;
  lead_time_days: number;
  default_supplier_id: string | null;
  supplier_name: string | null;
  supplier_lead_time_days: number | null;
  is_active: boolean;
  on_hand: number;
  on_order: number;
  wo_supply: number;
  wo_demand: number;
  stock_value: number;
};

export type Company = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  npwp: string | null;
  logo_url: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_holder: string | null;
  default_tax_rate: number;
  default_payment_terms: number;
  invoice_footer: string | null;
};

/** Opsi item ringkas untuk dropdown di form dokumen. */
export type ItemOption = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  item_type: ItemType;
  sale_price: number;
  cost_price: number;
};

export type PartnerOption = { id: string; code: string; name: string; payment_terms?: number };
