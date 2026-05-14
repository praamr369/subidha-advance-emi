import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Refund and Cancellation Policy",
  description: "Refund, cancellation, return, reversal, and adjustment policy for Subidha Furniture.",
  path: "/refund-cancellation",
});

export default function RefundCancellationPolicyPage() {
  return (
    <PolicyPublicPage
      slug="refund-cancellation"
      pageTitle="Refund and Cancellation Policy"
      heroTitle="Refund and Cancellation Policy"
      heroSubtitle="Rules for cancellation, return, refund, reversals, and transaction-type-specific deductions."
    />
  );
}
