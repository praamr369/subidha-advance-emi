import AdminWorkbenchShell from "@/components/admin-workbench/AdminWorkbenchShell";
import {
  ADMIN_WORKBENCHES,
  type AdminWorkbenchDefinition,
} from "./workbench-config";

type SearchParams = Promise<{
  tab?: string | string[];
}>;

export default async function AdminWorkbenchRoute({
  workbench,
  searchParams,
}: {
  workbench: AdminWorkbenchDefinition["id"];
  searchParams: SearchParams;
}) {
  const definition = ADMIN_WORKBENCHES[workbench];
  const params = await searchParams;
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const activeTab = definition.tabs.some((tab) => tab.id === requestedTab)
    ? requestedTab!
    : definition.defaultTab;

  return <AdminWorkbenchShell definition={definition} activeTab={activeTab} />;
}
