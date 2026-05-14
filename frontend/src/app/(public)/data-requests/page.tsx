import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Data Requests Policy",
  description: "Data correction, access, and deletion request process with legal retention limits.",
  path: "/data-requests",
});

export default function DataRequestsPolicyPage() {
  return (
    <PolicyPublicPage
      slug="data-requests"
      pageTitle="Data Requests Policy"
      heroTitle="Data Correction, Access, and Deletion"
      heroSubtitle="Customer rights request workflow with contract, accounting, audit, and legal-retention safeguards."
    />
  );
}
