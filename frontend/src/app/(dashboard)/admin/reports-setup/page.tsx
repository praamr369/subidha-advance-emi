import AdminWorkbenchRoute from "@/domains/admin-workbenches/AdminWorkbenchRoute";

export default function ReportsSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  return <AdminWorkbenchRoute workbench="reports-setup" searchParams={searchParams} />;
}
