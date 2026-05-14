import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Delivery Policy",
  description: "Delivery eligibility, scheduling, inspection, and failed-delivery policy.",
  path: "/delivery-policy",
});

export default function DeliveryPolicyPage() {
  return (
    <PolicyPublicPage
      slug="delivery-policy"
      pageTitle="Delivery Policy"
      heroTitle="Delivery Policy"
      heroSubtitle="Delivery area, scheduling, address confirmation, inspection, and customer availability obligations."
    />
  );
}
