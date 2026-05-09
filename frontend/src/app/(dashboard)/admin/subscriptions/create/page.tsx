import { redirect } from "next/navigation";

import {
  type AsyncRouteSearchParams,
  redirectToCanonicalPath,
} from "@/lib/route-redirect";
import { ROUTES } from "@/lib/routes";

type PageProps = {
  searchParams?: AsyncRouteSearchParams;
};

export default async function AdminSubscriptionCreateCompatibilityPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const planValue = Array.isArray(params.plan_type)
    ? params.plan_type[0]
    : params.plan_type || (Array.isArray(params.plan) ? params.plan[0] : params.plan);
  const plan = String(planValue || "EMI").toUpperCase();
  const destination =
    plan === "RENT"
      ? ROUTES.admin.subscriptionsRentCreate
      : plan === "LEASE"
        ? ROUTES.admin.subscriptionsLeaseCreate
        : ROUTES.admin.subscriptionsAdvanceEmiCreate;

  if (Object.keys(params).length > 0) {
    await redirectToCanonicalPath(destination, Promise.resolve(params));
  }
  redirect(destination);
}
