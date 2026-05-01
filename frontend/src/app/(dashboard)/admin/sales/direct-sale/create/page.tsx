import { redirect } from "next/navigation";

import {
  type AsyncRouteSearchParams,
  redirectToCanonicalPath,
} from "@/lib/route-redirect";
import { ROUTES } from "@/lib/routes";

type PageProps = {
  searchParams?: AsyncRouteSearchParams;
};

export default async function AdminSalesDirectSaleCreatePage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const hasParams = Object.keys(resolved).length > 0;
  if (hasParams) {
    await redirectToCanonicalPath(ROUTES.admin.billingDirectSaleCreate, searchParams);
  }
  redirect(ROUTES.admin.billingDirectSaleCreate);
}
