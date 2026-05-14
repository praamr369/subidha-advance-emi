import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Service and Repair Policy",
  description: "Service request, inspection, warranty service, and paid-repair policy.",
  path: "/service-policy",
});

export default function ServicePolicyPage() {
  return (
    <PolicyPublicPage
      slug="service-policy"
      pageTitle="Service and Repair Policy"
      heroTitle="Service and Repair Policy"
      heroSubtitle="Service ticket flow, inspection outcomes, warranty coverage, paid repair cases, and escalation path."
    />
  );
}
