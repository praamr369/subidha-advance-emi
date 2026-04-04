import { redirect } from "next/navigation";

type AdminBatchGenerateLuckyIdsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminBatchGenerateLuckyIdsPage({
  params,
}: AdminBatchGenerateLuckyIdsPageProps) {
  const { id } = await params;
  redirect(`/admin/batches/${id}`);
}
