import AdminAmendmentDetail from "@/components/amendments/AdminDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return <AdminAmendmentDetail id={Number(resolvedParams.id)} />;
}
