import AdminWorkbenchRoute from "@/domains/admin-workbenches/AdminWorkbenchRoute";

export default function FinanceControlPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  return <AdminWorkbenchRoute workbench="finance-control" searchParams={searchParams} />;
}
