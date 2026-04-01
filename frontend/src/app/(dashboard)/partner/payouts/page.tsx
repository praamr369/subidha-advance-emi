import { redirect } from "next/navigation";

type PartnerPayoutsRedirectPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function buildRedirectQuery(
  params: Record<string, string | string[] | undefined>
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.trim()) {
      search.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) {
          search.append(key, item);
        }
      }
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

export default async function PartnerPayoutsRedirectPage({
  searchParams,
}: PartnerPayoutsRedirectPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  redirect(`/partner/commissions${buildRedirectQuery(resolvedSearchParams)}`);
}
