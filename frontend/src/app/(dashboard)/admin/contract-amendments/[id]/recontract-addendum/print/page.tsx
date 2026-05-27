import RecontractAddendumPrintPage from "@/components/amendments/documents/RecontractAddendumPrintPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return <RecontractAddendumPrintPage id={Number(resolvedParams.id)} role="admin" />;
}
