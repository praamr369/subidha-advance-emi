import { ADMIN_ROUTE_REGISTRY, type AdminRouteRegistryItem } from "@/config/admin-route-registry";

function normalizePath(value: string): string {
  const pathOnly = value.split("?")[0] ?? value;
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) {
    return pathOnly.slice(0, -1);
  }
  return pathOnly;
}

/** Match palette hrefs to the flat admin registry without extra network calls. */
export function lookupAdminRouteRegistry(href: string): AdminRouteRegistryItem | undefined {
  const exact = ADMIN_ROUTE_REGISTRY.find((row) => row.href === href);
  if (exact) {
    return exact;
  }
  const target = normalizePath(href);
  return ADMIN_ROUTE_REGISTRY.find((row) => normalizePath(row.href) === target);
}
