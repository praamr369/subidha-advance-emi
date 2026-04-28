import {
  type AsyncRouteSearchParams,
  redirectToCanonicalPath,
} from "@/lib/route-redirect";
import { ROUTES } from "@/lib/routes";

type PageProps = {
  searchParams?: AsyncRouteSearchParams;
};

export default async function AdminPaymentCreateCompatibilityPage({ searchParams }: PageProps) {
  await redirectToCanonicalPath(ROUTES.admin.financeCollect, searchParams);
}
