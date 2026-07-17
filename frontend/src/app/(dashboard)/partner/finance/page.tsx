import { type AsyncRouteSearchParams, redirectToCanonicalPath } from "@/lib/route-redirect";

type PageProps = { searchParams?: AsyncRouteSearchParams };

export default async function PartnerFinanceRedirect({ searchParams }: PageProps) {
  await redirectToCanonicalPath("/partner/payments", searchParams);
}
