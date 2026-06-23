import AdminWorkbenchRoute from "@/domains/admin-workbenches/AdminWorkbenchRoute";

export default function InventoryFulfillmentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  return <AdminWorkbenchRoute workbench="inventory-fulfillment" searchParams={searchParams} />;
}
