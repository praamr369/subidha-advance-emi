import { redirect } from "next/navigation";

import { buildAdminReconciliationRoute } from "@/lib/route-builders";

type SearchParamValue = string | string[] | undefined;

type PageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};

function appendParam(search: URLSearchParams, key: string, value: SearchParamValue) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item) {
        search.append(key, item);
      }
    }
    return;
  }

  if (value) {
    search.set(key, value);
  }
}

export default async function AdminPaymentReconciliationRedirectPage({
  searchParams,
}: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};

  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    appendParam(forwarded, key, value);
  }
  forwarded.set("view", "payments");

  redirect(
    buildAdminReconciliationRoute({
      view: "payments",
      subscription: forwarded.get("subscription"),
      payment: forwarded.get("payment"),
      status: forwarded.get("status"),
      flagged: forwarded.get("flagged"),
      locked: forwarded.get("locked"),
      q: forwarded.get("q"),
    })
  );
}
