import { AdminAmendmentList } from "../../../../components/amendments/PartnerList";

export default function Page({ searchParams }: { searchParams: { status?: string; contract_type?: string } }) {
  return <AdminAmendmentList status={searchParams.status || ""} contractType={searchParams.contract_type || ""} />;
}
