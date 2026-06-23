// Canonical route moved to /admin/requests/subscriptions
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function SubscriptionRequestsLegacyPage() { redirect("/admin/requests/subscriptions"); }
