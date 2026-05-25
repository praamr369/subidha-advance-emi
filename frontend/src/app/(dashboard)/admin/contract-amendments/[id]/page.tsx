import AdminAmendmentDetail from "@/components/amendments/AdminDetail";

export default function Page({ params }: { params: { id: string } }) {
  return <AdminAmendmentDetail id={Number(params.id)} />;
}
