import type { Metadata } from "next";

import LocalSeoLanding from "@/components/public/LocalSeoLanding";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Furniture Store in Asansol",
  description:
    "Subidha Furniture is a furniture store in Asansol, West Bengal offering beds, sofas, wardrobes, dining sets, mattresses and EMI plans. Visit our showroom.",
  path: "/furniture-store-asansol",
});

export default function FurnitureStoreAsansolPage() {
  return (
    <LocalSeoLanding
      heroEyebrow="Furniture store in Asansol"
      title="Furniture Store in Asansol — Subidha Furniture"
      subtitle="Beds, sofas, wardrobes, dining sets, mattresses and more, with EMI and Lucky Plan options as per approved terms."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Furniture Store in Asansol" }]}
      intro={[
        "Subidha Furniture is a furniture store based in Asansol, West Bengal. We help local families furnish their homes with beds, sofas, wardrobes, dining tables, mattresses and everyday furniture.",
        "You can pay directly, choose EMI, or ask about our Lucky Plan EMI purchase plan — all as per the approved terms explained on our plan and policy pages. Visit our showroom for current models and availability.",
      ]}
      sections={[
        {
          heading: "What you can shop for",
          body: [
            "Bedroom furniture including wooden beds and storage beds. Living room furniture including sofa sets and seating. Storage furniture including wardrobes and cabinets. Dining furniture including dining tables and chairs. Mattresses in common sizes. Selected home appliances where available.",
            "Models and stock change over time. Visit our showroom or contact us for the latest availability and current pricing.",
          ],
        },
        {
          heading: "Areas we serve",
          body: [
            "We serve customers in Asansol and nearby areas of Paschim Bardhaman. Delivery availability and any charges depend on the product and your location — please confirm with us before ordering.",
          ],
        },
        {
          heading: "Ways to pay",
          body: [
            "Direct purchase, EMI, and Lucky Plan EMI options may be available as per approved terms. Details of the Lucky Plan, including how eligible customers pay monthly EMIs and when future EMIs may be waived per the contract, are on our Lucky Plan pages.",
          ],
        },
      ]}
      quickLinks={[
        { label: "Lucky Plan EMI furniture", href: "/lucky-plan-emi-furniture-asansol" },
        { label: "Browse products", href: "/products" },
        { label: "Delivery in Asansol", href: "/delivery-asansol" },
        { label: "About us", href: "/about" },
        { label: "Contact", href: "/contact" },
      ]}
      faqs={[
        {
          question: "Where is Subidha Furniture located?",
          answer: "Subidha Furniture is a furniture store in Asansol, West Bengal. Please see our contact page for the showroom address and directions.",
        },
        {
          question: "Do you offer furniture on EMI in Asansol?",
          answer: "EMI and Lucky Plan EMI options may be available as per approved terms. Contact us or visit the showroom to understand the plans and eligibility.",
        },
        {
          question: "What furniture do you sell?",
          answer: "Beds, sofas, wardrobes, dining tables, mattresses and selected home items. Models and availability change, so visit the showroom for current options.",
        },
        {
          question: "Do you deliver in Asansol?",
          answer: "Delivery availability and charges depend on the product and location. Please confirm delivery details with us before placing an order.",
        },
      ]}
    />
  );
}
