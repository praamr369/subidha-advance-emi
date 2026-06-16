import { redirect } from "next/navigation";

// Phase 6: canonical /admin/requests/subscriptions alias.
// The legacy /admin/subscription-requests route remains the authoritative page.
export default function RequestsSubscriptionsAliasPage() {
  redirect("/admin/subscription-requests");
}
