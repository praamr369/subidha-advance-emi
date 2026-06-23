// Canonical route moved to /admin/requests/subscriptions/[id]
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function SubscriptionRequestDetailLegacyPage() { redirect("/admin/requests/subscriptions"); }
