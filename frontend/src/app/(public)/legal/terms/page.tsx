import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Terms and Conditions",
  description: "Terms and Conditions for Subidha Furniture website and business workflows.",
  path: "/legal/terms",
});

export default function LegalTermsPage() {
  return (
    <PolicyPublicPage
      slug="terms"
      pageTitle="Terms and Conditions"
      heroTitle="Terms and Conditions"
      heroSubtitle="General terms for website use, contracts, payment, delivery, support, and compliance workflows."
    />
  );
}
