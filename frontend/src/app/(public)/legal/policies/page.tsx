import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Business Policies",
  description: "Business policies for Subidha Furniture covering rent, lease, Lucky Plan EMI, delivery, warranty, payments, and customer service.",
  path: "/legal/policies",
});

export default function LegalPoliciesPage() {
  return (
    <PolicyPublicPage
      slug="policies"
      pageTitle="Business Policies"
      heroTitle="Business Policies"
      heroSubtitle="Consolidated reference for Subidha Furniture's business policies across all contract types, payment, delivery, and customer service."
    />
  );
}
