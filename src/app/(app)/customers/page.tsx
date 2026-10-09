import { PartnerList } from "@/components/partner-pages";

export const metadata = { title: "Customer" };

export default async function Page({ searchParams }: PageProps<"/customers">) {
  const { q } = await searchParams;
  return <PartnerList kind="customers" q={typeof q === "string" ? q : undefined} />;
}
