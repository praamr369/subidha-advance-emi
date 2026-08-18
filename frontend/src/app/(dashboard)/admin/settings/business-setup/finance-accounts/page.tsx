import { ROUTES } from "@/lib/routes";
import { redirectToCanonicalPath, type AsyncRouteSearchParams } from "@/lib/route-redirect";

export default async function LegacyFinanceAccountsRedirectAlias({ searchParams }: { searchParams: AsyncRouteSearchParams }) {
  // Redirect legacy business-setup finance accounts route to the unified accounting workspace
  await redirectToCanonicalPath(ROUTES.admin.accountingFinanceAccounts ?? "/admin/accounting/finance-accounts", searchParams);
}
