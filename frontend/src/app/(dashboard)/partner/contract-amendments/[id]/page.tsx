import PartnerAmendmentDetail from "../../../../../components/amendments/PartnerDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return <PartnerAmendmentDetail id={Number(resolvedParams.id)} />;
}
