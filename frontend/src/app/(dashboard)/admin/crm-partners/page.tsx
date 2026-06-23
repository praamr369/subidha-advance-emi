import AdminWorkbenchRoute from "@/domains/admin-workbenches/AdminWorkbenchRoute";

export default function CrmPartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  return <AdminWorkbenchRoute workbench="crm-partners" searchParams={searchParams} />;
}
