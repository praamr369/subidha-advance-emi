import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Lucky Plan EMI Policy",
  description: "Lucky Plan EMI terms including base-price contract rule and future-EMI waiver rule.",
  path: "/lucky-plan-policy",
});

export default function LuckyPlanPolicyPage() {
  return (
    <PolicyPublicPage
      slug="lucky-plan-policy"
      pageTitle="Lucky Plan EMI Policy"
      heroTitle="Lucky Plan EMI Policy"
      heroSubtitle="Contract rules for Lucky IDs, EMI basis, payment responsibility, and winner future-EMI waiver scope."
    />
  );
}
