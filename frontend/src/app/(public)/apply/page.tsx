import type { Metadata } from "next";

import ApplyPageClient from "./ApplyPageClient";

export const metadata: Metadata = {
  title: "Apply",
  description:
    "Submit a Lucky Plan product enquiry with your contact details and preferred EMI context.",
};

export default function ApplyPage() {
  return <ApplyPageClient />;
}
