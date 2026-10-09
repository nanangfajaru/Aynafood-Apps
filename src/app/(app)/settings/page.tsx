import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { saveSettings } from "@/lib/actions/master";
import { getCompany } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  const { supabase } = await requireUser();
  const c = await getCompany(supabase);

  return (
    <>
      <PageHeader title="Pengaturan" description="Profil perusahaan, pajak & informasi pembayaran untuk invoice." />
      <Card>
        <ActionForm action={saveSettings} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nama perusahaan *">
              <Input name="name" defaultValue={c.name} required />
            </Field>
            <Field label="NPWP">
              <Input name="npwp" defaultValue={c.npwp ?? ""} />
            </Field>
            <Field label="Telepon">
              <Input name="phone" defaultValue={c.phone ?? ""} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" defaultValue={c.email ?? ""} />
            </Field>
            <Field label="Alamat" className="md:col-span-2">
              <Textarea name="address" defaultValue={c.address ?? ""} rows={2} />
            </Field>
            <Field label="URL logo (PNG/JPG)" hint="Mis. dari Supabase Storage (public bucket)" className="md:col-span-2">
              <Input name="logo_url" type="url" defaultValue={c.logo_url ?? ""} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Bank">
              <Input name="bank_name" defaultValue={c.bank_name ?? ""} />
            </Field>
            <Field label="No. rekening">
              <Input name="bank_account" defaultValue={c.bank_account ?? ""} />
            </Field>
            <Field label="Atas nama">
              <Input name="bank_holder" defaultValue={c.bank_holder ?? ""} />
            </Field>
            <Field label="PPN default (%)" hint="Default 11% untuk invoice baru">
              <Input name="default_tax_rate" type="number" step="any" min={0} defaultValue={c.default_tax_rate} />
            </Field>
            <Field label="Termin default (hari)">
              <Input name="default_payment_terms" type="number" min={0} defaultValue={c.default_payment_terms} />
            </Field>
          </div>
          <Field label="Footer invoice">
            <Textarea name="invoice_footer" defaultValue={c.invoice_footer ?? ""} rows={2} />
          </Field>
          <SubmitButton>Simpan Pengaturan</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
