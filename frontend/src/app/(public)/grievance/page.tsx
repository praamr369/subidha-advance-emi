import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Customer Grievance Policy",
  description: "How customers can raise complaints and escalate unresolved issues.",
  path: "/grievance",
});

export default function GrievancePolicyPage() {
  return (
    <PolicyPublicPage
      slug="grievance"
      pageTitle="Customer Grievance Policy"
      heroTitle="Customer Grievance Policy"
      heroSubtitle="Complaint intake, review process, required evidence, and escalation handling for customer issues."
    />
  );
}
