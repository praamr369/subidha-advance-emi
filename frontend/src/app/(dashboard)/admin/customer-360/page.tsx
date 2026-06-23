import AdminWorkbenchRoute from "@/domains/admin-workbenches/AdminWorkbenchRoute";

export default function Customer360Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  return <AdminWorkbenchRoute workbench="customer-360" searchParams={searchParams} />;
}
