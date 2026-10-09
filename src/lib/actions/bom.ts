"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { friendlyError, type ActionResult } from "./common";

export type BomPayload = {
  item_id: string;
  code: string;
  name: string;
  output_qty: number;
  is_default: boolean;
  is_active: boolean;
  notes: string;
  lines: { material_id: string; qty: number; scrap_pct: number; notes: string }[];
};

export async function saveBom(id: string | null, payload: BomPayload): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!payload.item_id) return { error: "Pilih produk (FG)" };
  if (!(payload.output_qty > 0)) return { error: "Qty output harus > 0" };
  const lines = payload.lines.filter((l) => l.material_id);
  if (lines.length === 0) return { error: "Tambahkan minimal 1 material" };
  if (lines.some((l) => !(l.qty > 0))) return { error: "Qty material harus > 0" };

  const { data, error } = await supabase.rpc("save_bom", { p_id: id, p_data: { ...payload, lines } });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/bom");
  revalidatePath("/mrp");
  redirect(`/bom/${data}`);
}

export async function deleteBom(id: string, _: ActionResult): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("boms").delete().eq("id", id);
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "BOM sudah dipakai di Work Order. Nonaktifkan BOM ini daripada menghapusnya."
          : friendlyError(error),
    };
  }
  revalidatePath("/bom");
  redirect("/bom");
}
