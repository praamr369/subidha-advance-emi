// Canonical route moved to /admin/requests/subscriptions/[id]
// HTTP redirect configured in next.config.ts (id-preserving). This component is
// a fallback that preserves the id if it ever renders.
import { redirect } from "next/navigation";

export default async function SubscriptionRequestDetailLegacyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/requests/subscriptions/${id}`);
}
