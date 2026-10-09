import { PartnerFormPage } from "@/components/partner-pages";

export default async function Page({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  return <PartnerFormPage kind="customers" id={id} />;
}
