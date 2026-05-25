import AdminAmendmentList from "@/components/amendments/AdminList";

export default function Page({ searchParams }: { searchParams: { status?: string; contract_type?: string } }) {
  return <AdminAmendmentList status={searchParams.status || ""} contractType={searchParams.contract_type || ""} />;
}
