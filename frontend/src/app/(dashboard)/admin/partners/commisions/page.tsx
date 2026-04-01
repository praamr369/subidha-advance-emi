import {
  type AsyncRouteSearchParams,
  redirectToCanonicalPath,
} from "@/lib/route-redirect";

type PageProps = {
  searchParams?: AsyncRouteSearchParams;
};

export default async function AdminPartnersCommisionsPage({
  searchParams,
}: PageProps) {
  await redirectToCanonicalPath("/admin/finance/commissions", searchParams);
}
