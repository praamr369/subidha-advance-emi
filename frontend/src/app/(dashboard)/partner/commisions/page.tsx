import {
  type AsyncRouteSearchParams,
  redirectToCanonicalPath,
} from "@/lib/route-redirect";

type PageProps = {
  searchParams?: AsyncRouteSearchParams;
};

export default async function PartnerCommisionsPage({ searchParams }: PageProps) {
  await redirectToCanonicalPath("/partner/commissions", searchParams);
}
