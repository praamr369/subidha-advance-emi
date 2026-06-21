import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Privacy Policy",
  description: "Privacy policy and data-handling disclosures for Subidha Furniture.",
  path: "/legal/privacy",
});

export default function LegalPrivacyPage() {
  return (
    <PolicyPublicPage
      slug="privacy"
      pageTitle="Privacy Policy"
      heroTitle="Privacy Policy"
      heroSubtitle="How customer data is collected, used, protected, retained, and handled across business workflows."
    />
  );
}
