import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

// Compatibility route: canonical customer detail is /admin/customers/[id].
export default async function AdminCrmCustomerDetailRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/customers/${id}`);
}
