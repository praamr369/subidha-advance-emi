import { ROUTES } from "@/lib/routes";
import { type AsyncRouteSearchParams, redirectToCanonicalPath } from "@/lib/route-redirect";

export default async function BusinessComplianceRedirectAlias({ searchParams }: { searchParams: AsyncRouteSearchParams }) {
  await redirectToCanonicalPath(ROUTES.admin.settingsCompliancePolicies, searchParams);
}
