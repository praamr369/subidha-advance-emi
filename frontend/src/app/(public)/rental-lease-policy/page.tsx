import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Rental and Lease Policy",
  description: "Rental and lease contracts, deposit handling, dues, and return-inspection policy.",
  path: "/rental-lease-policy",
});

export default function RentalLeasePolicyPage() {
  return (
    <PolicyPublicPage
      slug="rental-lease-policy"
      pageTitle="Rental and Lease Policy"
      heroTitle="Rental and Lease Policy"
      heroSubtitle="Contract creation, security deposit controls, monthly dues, return inspection, and closure."
    />
  );
}
