import {
  type AsyncRouteSearchParams,
  redirectToCanonicalPath,
} from "@/lib/route-redirect";

type PageProps = {
  searchParams?: AsyncRouteSearchParams;
};

export default async function AdminReconciliationRunsAliasPage({
  searchParams,
}: PageProps) {
  await redirectToCanonicalPath("/admin/accounting/bridge-reconciliation", searchParams);
}
