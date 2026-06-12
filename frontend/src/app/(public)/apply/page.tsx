import type { Metadata } from "next";

import { buildPublicMetadata } from "@/lib/public-seo";

import ApplyPageClient from "./ApplyPageClient";

export const metadata: Metadata = buildPublicMetadata({
  title: "Apply / Enquire",
  description:
    "Submit a product and plan enquiry for Lucky Plan EMI, rent, lease, or direct-sale guidance from Subidha Furniture.",
  path: "/apply",
});

export default function ApplyPage() {
  return <ApplyPageClient />;
}
