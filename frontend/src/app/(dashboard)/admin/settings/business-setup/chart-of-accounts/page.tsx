import { ROUTES } from "@/lib/routes";
import { redirectToCanonicalPath, type AsyncRouteSearchParams } from "@/lib/route-redirect";

export default async function LegacyChartOfAccountsRedirectAlias({ searchParams }: { searchParams: AsyncRouteSearchParams }) {
  await redirectToCanonicalPath(ROUTES.admin.accountingChartOfAccounts ?? "/admin/accounting/chart-of-accounts", searchParams);
}
