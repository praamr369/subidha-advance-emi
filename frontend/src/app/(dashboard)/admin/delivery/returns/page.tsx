import {
  type AsyncRouteSearchParams,
  redirectToCanonicalPath,
} from "@/lib/route-redirect";
import { ROUTES } from "@/lib/routes";

type PageProps = {
  searchParams?: AsyncRouteSearchParams;
};

export default async function AdminDeliveryReturnsPage({ searchParams }: PageProps) {
  await redirectToCanonicalPath(ROUTES.admin.serviceDeskReturns, searchParams);
}
