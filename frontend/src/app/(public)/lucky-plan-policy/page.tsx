import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Subidha EMI (SFEMI) Policy",
  description: "SFEMI Advance EMI terms, contract basis, payment responsibility, and customer protections.",
  path: "/lucky-plan-policy",
});

export default function LuckyPlanPolicyPage() {
  return (
    <PolicyPublicPage
      slug="lucky-plan-policy"
      pageTitle="Subidha EMI (SFEMI) Policy"
      heroTitle="Subidha EMI (SFEMI) Policy"
      heroSubtitle="Contract rules for SFEMI enrollment, Advance EMI basis, payment responsibility, and customer protections."
    />
  );
}
