import PartnerSubscriptionRequestCreatePage from "@/domains/subscription-requests/pages/PartnerSubscriptionRequestCreatePage";
import { type AsyncRouteSearchParams } from "@/lib/route-redirect";

type PageProps = { searchParams?: AsyncRouteSearchParams };

export default async function PartnerSubscriptionRequestsCreatePage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  let queryString = "";
  if (resolvedSearchParams && typeof resolvedSearchParams === "object") {
    const searchParamsObj = new URLSearchParams(resolvedSearchParams as Record<string, string>);
    queryString = searchParamsObj.toString();
  }

  return <PartnerSubscriptionRequestCreatePage queryString={queryString} />;
}
