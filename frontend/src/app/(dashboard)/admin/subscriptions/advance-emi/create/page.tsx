"use client";

import { useSearchParams } from "next/navigation";

import SubscriptionCreatePage from "@/domains/subscriptions/pages/SubscriptionCreatePage";

export default function AdminAdvanceEmiCreatePage() {
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  params.set("plan_type", "EMI");
  return <SubscriptionCreatePage queryString={params.toString()} />;
}
