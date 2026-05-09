"use client";

import { useSearchParams } from "next/navigation";

import SubscriptionCreatePage from "@/domains/subscriptions/pages/SubscriptionCreatePage";

export default function AdminLeaseCreatePage() {
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  params.set("plan_type", "LEASE");
  return <SubscriptionCreatePage queryString={params.toString()} />;
}
