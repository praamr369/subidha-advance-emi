import { redirect } from "next/navigation";

export default async function AdminBillingDirectSaleDetailAliasPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  redirect(`/admin/billing/direct-sale/${id}`);
}

