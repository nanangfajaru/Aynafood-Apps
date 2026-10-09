import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { getInvoiceFull } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, ctx: RouteContext<"/invoices/[id]/pdf">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new Response("Unauthorized", { status: 401 });

  const data = await getInvoiceFull(supabase, id);
  if (!data) return new Response("Invoice tidak ditemukan", { status: 404 });

  const pdf = await renderInvoicePdf(data);
  const filename = `${data.invoice.invoice_no.replaceAll("/", "-")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
