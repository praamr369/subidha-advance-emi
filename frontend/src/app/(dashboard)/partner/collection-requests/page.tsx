import { type AsyncRouteSearchParams, redirectToCanonicalPath } from "@/lib/route-redirect";

type PageProps = { searchParams?: AsyncRouteSearchParams };

export default async function PartnerCollectionRequestsRedirect({ searchParams }: PageProps) {
  await redirectToCanonicalPath("/partner/collections", searchParams);
}
