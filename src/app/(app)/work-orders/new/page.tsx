import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { createWorkOrder } from "@/lib/actions/production";
import { todayISO } from "@/lib/format";
import { getItemOptions } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Work Order Baru" };

export default async function NewWorkOrderPage({ searchParams }: PageProps<"/work-orders/new">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const [products, { data: orders }] = await Promise.all([
    getItemOptions(supabase, ["FG"]),
    supabase
      .from("v_orders")
      .select("id, order_no, customer_name")
      .in("status", ["CONFIRMED", "IN_PRODUCTION", "PARTIAL"])
      .order("order_no"),
  ]);

  return (
    <>
      <PageHeader
        title="Work Order Baru"
        description="Untuk produksi stok atau order tertentu. Kebutuhan material diambil dari BOM default produk."
        back={{ href: "/work-orders", label: "Work Order" }}
      />
      <Card>
        <ActionForm action={createWorkOrder} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Produk *">
            <Select name="item_id" required defaultValue={typeof sp.item === "string" ? sp.item : ""}>
              <option value="">— Pilih produk —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name} ({p.unit})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Qty produksi *">
            <Input
              name="qty"
              type="number"
              step="any"
              min={0}
              required
              defaultValue={typeof sp.qty === "string" ? sp.qty : ""}
            />
          </Field>
          <Field label="Tanggal rencana">
            <Input name="planned_date" type="date" defaultValue={todayISO()} />
          </Field>
          <Field label="Untuk order (opsional)" hint="Kosongkan jika produksi untuk stok">
            <Select name="order_id" defaultValue={typeof sp.order === "string" ? sp.order : ""}>
              <option value="">— Produksi stok —</option>
              {(orders ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_no} · {o.customer_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Catatan" className="md:col-span-2">
            <Textarea name="notes" rows={2} />
          </Field>
          <div className="md:col-span-2">
            <SubmitButton>Buat Work Order</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
