import { PartnerList } from "@/components/partner-pages";

export const metadata = { title: "Supplier" };

export default async function Page({ searchParams }: PageProps<"/suppliers">) {
  const { q } = await searchParams;
  return <PartnerList kind="suppliers" q={typeof q === "string" ? q : undefined} />;
}
