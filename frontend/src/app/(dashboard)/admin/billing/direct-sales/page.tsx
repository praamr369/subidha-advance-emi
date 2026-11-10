import { redirectToCanonicalPath, type AsyncRouteSearchParams } from "@/lib/route-redirect";

export default async function AdminBillingDirectSalesAliasPage(props: {
  searchParams?: AsyncRouteSearchParams;
}) {
  await redirectToCanonicalPath("/admin/billing/direct-sale", props.searchParams);
}

