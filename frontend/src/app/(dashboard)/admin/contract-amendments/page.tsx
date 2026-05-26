import AdminAmendmentList from "@/components/amendments/AdminList";

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; contract_type?: string }> }) {
  const resolvedSearchParams = await searchParams;
  return <AdminAmendmentList status={resolvedSearchParams.status || ""} contractType={resolvedSearchParams.contract_type || ""} />;
}
