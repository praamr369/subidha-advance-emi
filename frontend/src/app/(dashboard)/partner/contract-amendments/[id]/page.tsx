import PartnerAmendmentDetail from "../../../../../components/amendments/PartnerDetail";

export default function Page({ params }: { params: { id: string } }) {
  return <PartnerAmendmentDetail id={Number(params.id)} />;
}
