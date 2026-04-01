import { redirect } from "next/navigation";

type SearchParamValue = string | string[] | undefined;
type RouteSearchParamsRecord = Record<string, SearchParamValue>;

export type RouteSearchParams =
  | RouteSearchParamsRecord
  | Promise<RouteSearchParamsRecord>
  | undefined;

export type AsyncRouteSearchParams = Promise<RouteSearchParamsRecord> | undefined;

function appendSearchParam(
  params: URLSearchParams,
  key: string,
  value: string | string[]
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = item.trim();
      if (normalized) {
        params.append(key, normalized);
      }
    }
    return;
  }

  const normalized = value.trim();
  if (normalized) {
    params.set(key, normalized);
  }
}

export async function redirectToCanonicalPath(
  destination: string,
  searchParams?: RouteSearchParams
) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (typeof value === "string" || Array.isArray(value)) {
      appendSearchParam(params, key, value);
    }
  }

  const query = params.toString();
  redirect(query ? `${destination}?${query}` : destination);
}
