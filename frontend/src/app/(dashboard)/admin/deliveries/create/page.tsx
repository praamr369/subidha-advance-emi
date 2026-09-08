import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

// Compatibility route: there is no separate delivery "create" screen. The
// deliveries workspace hosts the create form inline and already prefills it
// from ?subscription=<id>, so this alias forwards the query string through
// rather than 404-ing on links/bookmarks that point at /deliveries/create.
export default async function AdminDeliveryCreateRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
    } else {
      query.append(key, value);
    }
  }

  const queryString = query.toString();
  redirect(queryString ? `${ROUTES.admin.deliveries}?${queryString}` : ROUTES.admin.deliveries);
}
