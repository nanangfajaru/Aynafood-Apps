import { AppShell } from "@/components/app-shell";
import { logout } from "@/lib/actions/auth";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, claims } = await requireUser();
  const { data: company } = await supabase.from("company_settings").select("name").eq("id", 1).maybeSingle();

  return (
    <AppShell
      userEmail={String(claims.email ?? "")}
      companyName={company?.name ?? "Aynafood"}
      logoutAction={logout}
    >
      {children}
    </AppShell>
  );
}
