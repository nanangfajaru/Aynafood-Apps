import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import {
  Badge,
  Card,
  EmptyRow,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { deletePartner, savePartner } from "@/lib/actions/master";
import { searchTerm } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import type { Partner } from "@/lib/types";

type Kind = "customers" | "suppliers";
const LABEL: Record<Kind, string> = { customers: "Customer", suppliers: "Supplier" };

export async function PartnerList({ kind, q: rawQ }: { kind: Kind; q?: string }) {
  const q = searchTerm(rawQ);
  const { supabase } = await requireUser();
  let query = supabase.from(kind).select("*").order("code");
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  const { data } = await query;
  const rows = (data ?? []) as Partner[];

  return (
    <>
      <PageHeader
        title={LABEL[kind]}
        description={kind === "customers" ? "Data pelanggan untuk order & invoice" : "Data pemasok untuk purchase order"}
        actions={
          <LinkButton href={`/${kind}/new`} variant="primary">
            + {LABEL[kind]} Baru
          </LinkButton>
        }
      />
      <Card bodyClassName="p-0">
        <form className="border-b border-slate-200 p-3">
          <Input name="q" defaultValue={q} placeholder="Cari kode atau nama…" className="max-w-xs" />
        </form>
        <Table>
          <thead>
            <tr>
              <Th>Kode</Th>
              <Th>Nama</Th>
              <Th>Kontak</Th>
              <Th>Telepon</Th>
              <Th>{kind === "customers" ? "Termin (hari)" : "Lead time (hari)"}</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <EmptyRow colSpan={6}>Belum ada data</EmptyRow>}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/${kind}/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.code}
                  </Link>
                </Td>
                <Td>{r.name}</Td>
                <Td>{r.contact_person ?? "-"}</Td>
                <Td>{r.phone ?? "-"}</Td>
                <Td>{kind === "customers" ? r.payment_terms : r.lead_time_days}</Td>
                <Td>{r.is_active ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

export async function PartnerFormPage({ kind, id }: { kind: Kind; id: string | null }) {
  let row: Partner | null = null;
  if (id) {
    const { supabase } = await requireUser();
    const { data } = await supabase.from(kind).select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    row = data as Partner;
  }

  return (
    <>
      <PageHeader
        title={row ? `${LABEL[kind]}: ${row.name}` : `${LABEL[kind]} Baru`}
        back={{ href: `/${kind}`, label: LABEL[kind] }}
        actions={
          row && (
            <ActionButton
              action={deletePartner.bind(null, kind, row.id)}
              confirmText={`Hapus ${LABEL[kind].toLowerCase()} ini?`}
              variant="danger"
            >
              Hapus
            </ActionButton>
          )
        }
      />
      <Card>
        <ActionForm action={savePartner.bind(null, kind, id)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Kode *">
            <Input name="code" defaultValue={row?.code} required placeholder={kind === "customers" ? "CUS-001" : "SUP-001"} />
          </Field>
          <Field label="Nama *">
            <Input name="name" defaultValue={row?.name} required />
          </Field>
          <Field label="Kontak">
            <Input name="contact_person" defaultValue={row?.contact_person ?? ""} />
          </Field>
          <Field label="Telepon">
            <Input name="phone" defaultValue={row?.phone ?? ""} />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={row?.email ?? ""} />
          </Field>
          <Field label="NPWP">
            <Input name="npwp" defaultValue={row?.npwp ?? ""} />
          </Field>
          {kind === "customers" ? (
            <Field label="Termin pembayaran (hari)" hint="Dipakai untuk jatuh tempo invoice">
              <Input name="payment_terms" type="number" min={0} defaultValue={row?.payment_terms ?? 30} />
            </Field>
          ) : (
            <Field label="Lead time (hari)" hint="Waktu dari PO sampai barang datang">
              <Input name="lead_time_days" type="number" min={0} defaultValue={row?.lead_time_days ?? 0} />
            </Field>
          )}
          <Field label="Status">
            <label className="flex items-center gap-2 py-2 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={row?.is_active ?? true} /> Aktif
            </label>
          </Field>
          <Field label="Alamat" className="md:col-span-2">
            <Textarea name="address" defaultValue={row?.address ?? ""} />
          </Field>
          <Field label="Catatan" className="md:col-span-2">
            <Textarea name="notes" defaultValue={row?.notes ?? ""} rows={2} />
          </Field>
          <div className="md:col-span-2">
            <SubmitButton>Simpan</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
