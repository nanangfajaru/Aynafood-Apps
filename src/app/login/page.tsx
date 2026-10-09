import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { login } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Login" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-brand-600 text-xl font-bold text-white">
            A
          </div>
          <h1 className="mt-3 text-xl font-semibold text-slate-900">Aynafood</h1>
          <p className="text-sm text-slate-500">Invoicing · MRP · Inventory</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <ActionForm action={login} className="space-y-4">
            <Field label="Email">
              <Input name="email" type="email" autoComplete="email" required autoFocus />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
            <SubmitButton className="w-full">Masuk</SubmitButton>
          </ActionForm>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Akun dibuat oleh admin melalui Supabase Auth.
        </p>
      </div>
    </div>
  );
}
