import DecisionSheetPrintPage from "@/components/amendments/documents/DecisionSheetPrintPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return <DecisionSheetPrintPage id={Number(resolvedParams.id)} />;
}
