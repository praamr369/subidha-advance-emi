import type { Metadata } from "next";

import LocalSeoLanding from "@/components/public/LocalSeoLanding";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Furniture Delivery in Asansol",
  description:
    "Subidha Furniture offers furniture delivery in Asansol and nearby areas. Delivery availability and charges depend on the product and your location.",
  path: "/delivery-asansol",
});

export default function DeliveryAsansolPage() {
  return (
    <LocalSeoLanding
      heroEyebrow="Furniture delivery in Asansol"
      title="Furniture Delivery in Asansol"
      subtitle="Delivery to Asansol and nearby areas. Availability and any charges depend on the product and your location."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Delivery in Asansol" }]}
      intro={[
        "Subidha Furniture offers delivery for furniture purchased from our Asansol showroom. We deliver within Asansol and to nearby areas of Paschim Bardhaman.",
        "Delivery availability, scheduling, and any charges depend on the specific product and your delivery location. Please confirm the delivery details with us before placing your order.",
      ]}
      sections={[
        {
          heading: "Delivery area",
          body: [
            "We primarily serve Asansol and surrounding localities. For addresses outside our usual area, contact us first so we can confirm whether delivery is possible and what it may involve.",
          ],
        },
        {
          heading: "How delivery works",
          body: [
            "Once your order and address are confirmed, we schedule delivery. Please ensure someone is available at the address to receive and inspect the furniture. Specific scheduling and inspection steps follow our delivery policy.",
          ],
        },
        {
          heading: "Charges and timelines",
          body: [
            "Delivery charges and timelines are not fixed on this page because they depend on the product size and your location. We will share the applicable details when you order. See our delivery policy for the full terms.",
          ],
        },
      ]}
      quickLinks={[
        { label: "Delivery policy", href: "/delivery-policy" },
        { label: "Furniture store in Asansol", href: "/furniture-store-asansol" },
        { label: "Browse products", href: "/products" },
        { label: "Contact", href: "/contact" },
      ]}
      faqs={[
        {
          question: "Do you deliver furniture in Asansol?",
          answer: "Yes, we deliver in Asansol and nearby areas. Delivery availability and charges depend on the product and your location, so please confirm with us first.",
        },
        {
          question: "How much does delivery cost?",
          answer: "Delivery charges depend on the product and delivery location. We share the applicable charge when you place your order.",
        },
        {
          question: "Do you deliver outside Asansol?",
          answer: "For areas outside Asansol, contact us to confirm whether delivery is possible and what it involves.",
        },
      ]}
    />
  );
}
