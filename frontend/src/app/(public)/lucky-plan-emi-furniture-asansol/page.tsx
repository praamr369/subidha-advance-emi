import type { Metadata } from "next";

import LocalSeoLanding from "@/components/public/LocalSeoLanding";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Lucky Plan EMI Furniture in Asansol",
  description:
    "Lucky Plan EMI is a Subidha Furniture purchase plan in Asansol where eligible customers pay monthly EMIs. Winners may get future EMIs waived per contract terms.",
  path: "/lucky-plan-emi-furniture-asansol",
});

export default function LuckyPlanEmiFurnitureAsansolPage() {
  return (
    <LocalSeoLanding
      heroEyebrow="Lucky Plan EMI furniture"
      title="Lucky Plan EMI Furniture in Asansol"
      subtitle="A Subidha Furniture purchase plan where eligible customers pay monthly EMIs, and winners may get future EMIs waived as per the approved rulebook."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Lucky Plan EMI Furniture" }]}
      intro={[
        "Lucky Plan EMI is a Subidha Furniture purchase plan where eligible customers buy furniture and pay monthly EMIs. If a customer wins according to the approved Lucky Plan rulebook, future EMIs may be waived as per the contract terms.",
        "This is a furniture purchase plan, not a lottery or an investment scheme. There is no guaranteed win, no guaranteed free furniture, and no financial return. Please read the full rulebook and terms before joining.",
      ]}
      sections={[
        {
          heading: "How Lucky Plan EMI works",
          body: [
            "You choose furniture and enrol in a Lucky Plan batch. You pay your monthly EMI as per your contract. Draws follow the approved rulebook. If your contract wins as per those rules, remaining future EMIs may be waived per the contract terms.",
            "Your obligations, eligibility, and the waiver conditions are defined by the approved rulebook and your signed contract — not by this page.",
          ],
        },
        {
          heading: "Important disclaimers",
          body: [
            "Lucky Plan EMI does not promise or guarantee that any customer will win. Winning does not provide cash, investment return, or gambling income — it only means future EMIs may be waived per the contract. Continue paying your EMIs as per your contract unless your contract states otherwise.",
          ],
        },
        {
          heading: "Read the full terms",
          body: [
            "Before enrolling, read the Lucky Plan rulebook and the Lucky Plan terms/policy pages, and ask us any questions at the showroom. Contract terms always take precedence over marketing summaries.",
          ],
        },
      ]}
      quickLinks={[
        { label: "Lucky Plan overview", href: "/lucky-plan" },
        { label: "Rulebook", href: "/rulebook" },
        { label: "Lucky Plan terms", href: "/lucky-plan-policy" },
        { label: "Furniture store in Asansol", href: "/furniture-store-asansol" },
        { label: "Contact", href: "/contact" },
      ]}
      faqs={[
        {
          question: "Is Lucky Plan EMI a lottery?",
          answer: "No. It is a furniture purchase plan where eligible customers pay monthly EMIs. Draws follow an approved rulebook, but there is no guaranteed win and no cash prize.",
        },
        {
          question: "What happens if I win?",
          answer: "If your contract wins according to the approved rulebook, your future EMIs may be waived as per the contract terms. It does not provide cash or investment return.",
        },
        {
          question: "Do I keep paying EMIs?",
          answer: "Yes, you pay your monthly EMIs as per your contract unless your contract states a waiver has been applied. Please follow your signed contract.",
        },
        {
          question: "Where can I read the full rules?",
          answer: "See our Lucky Plan overview, rulebook, and Lucky Plan terms pages, or ask at the Subidha Furniture showroom in Asansol.",
        },
      ]}
    />
  );
}
