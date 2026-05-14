import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Warranty Policy",
  description: "Manufacturer and shop warranty support policy for Subidha Furniture.",
  path: "/warranty",
});

export default function WarrantyPolicyPage() {
  return (
    <PolicyPublicPage
      slug="warranty"
      pageTitle="Warranty Policy"
      heroTitle="Warranty Policy"
      heroSubtitle="Coverage sources, inspection expectations, exclusions, and service support workflows."
    />
  );
}
