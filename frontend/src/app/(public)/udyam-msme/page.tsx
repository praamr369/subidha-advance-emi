import type { Metadata } from "next";

import PolicyPublicPage from "@/components/public/PolicyPublicPage";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Udyam / MSME Information",
  description: "Udyam/MSME public disclosure and false-claim prevention statement.",
  path: "/udyam-msme",
});

export default function UdyamMsmePolicyPage() {
  return (
    <PolicyPublicPage
      slug="udyam-msme"
      pageTitle="Udyam / MSME Information"
      heroTitle="Udyam / MSME Information"
      heroSubtitle="Registration status disclosure policy with strict no-fake-claim governance and admin-only certificate handling."
    />
  );
}
