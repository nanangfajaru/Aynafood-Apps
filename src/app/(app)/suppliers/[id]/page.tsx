import { PartnerFormPage } from "@/components/partner-pages";

export default async function Page({ params }: PageProps<"/suppliers/[id]">) {
  const { id } = await params;
  return <PartnerFormPage kind="suppliers" id={id} />;
}
