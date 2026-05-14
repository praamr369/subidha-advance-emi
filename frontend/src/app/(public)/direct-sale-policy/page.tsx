import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Direct Sale Policy",
  description: "Direct sale invoice, receipt, delivery, cancellation, return, and service linkage policy.",
  path: "/direct-sale-policy",
});

export default function DirectSalePolicyPage() {
  return (
    <PolicyPublicPage
      slug="direct-sale-policy"
      pageTitle="Direct Sale Policy"
      heroTitle="Direct Sale Policy"
      heroSubtitle="Normal sale controls for invoice/receipt records, delivery, cancellation, return, and disputes."
    />
  );
}
