import {
  type AsyncRouteSearchParams,
  redirectToCanonicalPath,
} from "@/lib/route-redirect";

type PageProps = {
  searchParams?: AsyncRouteSearchParams;
};

export default async function AdminPartnerSingularCommissionsPage({
  searchParams,
}: PageProps) {
  await redirectToCanonicalPath("/admin/finance/commissions", searchParams);
}
