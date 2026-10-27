"use client";

import { use } from "react";
import SubscriptionCreatePage from "@/domains/subscriptions/pages/SubscriptionCreatePage";

export default function AdminSubscriptionEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const subscriptionId = Number(resolvedParams.id);

  return (
    <SubscriptionCreatePage
      mode="edit"
      subscriptionId={subscriptionId}
    />
  );
}

