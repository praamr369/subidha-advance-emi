import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Payment Policy",
  description: "Accepted modes, receipt rules, failed-payment handling, and reconciliation policy.",
  path: "/payment-policy",
});

export default function PaymentPolicyPage() {
  return (
    <PolicyPublicPage
      slug="payment-policy"
      pageTitle="Payment Policy"
      heroTitle="Payment Policy"
      heroSubtitle="Accepted payment modes, receipts, pending transactions, outstanding dues, and reconciliation safeguards."
    />
  );
}
