import CustomerAmendmentDetail from "@/components/amendments/CustomerDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return <CustomerAmendmentDetail id={Number(resolvedParams.id)} />;
}
