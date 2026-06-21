import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import FaqBlock from "@/components/public/FaqBlock";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import {
  FULL_PUBLIC_FAQ,
  PHASE10C_FAQ,
  PUBLIC_LEGAL_DISCLAIMER_POINTS,
} from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "FAQ",
  description:
    "Answers to common questions about Subidha Core, Advance EMI (Lucky Plan), Lucky IDs, monthly draw, winner waiver, rent, lease, payment receipts, partner payouts, and delivery.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <PublicPageShell
      title="Frequently Asked Questions"
      subtitle="Clear answers to the questions customers ask most about Subidha Core, Lucky Plan, rent, lease, payments, delivery, and more."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "FAQ" },
      ]}
      hero={{
        eyebrow: "Customer help",
        badges: ["Subidha Core", "Lucky Plan", "Rent / Lease", "Payments", "Delivery"],
      }}
      actions={[
        { label: "Contact Store", href: ROUTES.public.contact, variant: "secondary" },
        { label: "View Contracts", href: ROUTES.public.contracts, variant: "primary" },
      ]}
    >
      <section className="space-y-4">
        <SectionHeader
          eyebrow="About Subidha Core and Advance EMI"
          title="What is Subidha Core and Advance EMI / Lucky Plan?"
          description="Start here if you are new to Subidha Furniture's digital system."
        />
        <FaqBlock items={PHASE10C_FAQ.filter((_, i) => i < 3)} />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Lucky Plan questions"
          title="Lucky Plan EMI & Lucky ID"
          description="Everything customers want to know about the Lucky Plan subscription, Lucky IDs, and the monthly draw."
        />
        <FaqBlock items={FULL_PUBLIC_FAQ.filter((_, i) => i < 5)} />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Payments & receipts"
          title="Payments, receipts, and proof"
          description="How payments are recorded and how customers can access their receipt history."
        />
        <FaqBlock
          items={[
            PHASE10C_FAQ[3],
            ...FULL_PUBLIC_FAQ.filter((_, i) => i >= 5 && i < 9),
          ]}
        />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Rent & lease"
          title="Rent, lease, and deposit questions"
        />
        <FaqBlock items={FULL_PUBLIC_FAQ.filter((_, i) => i >= 9 && i < 12)} />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Partners and payouts"
          title="Partner role and commission questions"
        />
        <FaqBlock items={[PHASE10C_FAQ[4]]} />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Documents & transparency"
          title="Documents, draw transparency, and customer portal"
        />
        <FaqBlock items={FULL_PUBLIC_FAQ.filter((_, i) => i >= 12)} />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Legal and policies"
          title="Where to find terms, policies, and contact"
        />
        <FaqBlock items={[PHASE10C_FAQ[5]]} />
      </section>

      <PublicMarketingBanner
        eyebrow="Still have questions?"
        title="Contact the branch directly"
        description="Our showroom team can explain plan options, batch availability, monthly commitment, and document requirements in person or by phone."
        items={[
          { title: "In-person", description: "Visit the showroom for a direct consultation with our branch team." },
          { title: "Phone or WhatsApp", description: "Contact details are listed on the Contact page." },
          { title: "Online enquiry", description: "Submit an online enquiry through the Apply page for a callback." },
        ]}
      />

      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Ready to get started?"
        description="Browse products, explore plan options, or send an enquiry directly to the branch."
        actions={[
          { href: ROUTES.public.products, label: "View products", variant: "secondary" },
          { href: ROUTES.public.contracts, label: "Explore Contracts", variant: "secondary" },
          { href: ROUTES.public.rulebook, label: "View Rulebook", variant: "secondary" },
          { href: ROUTES.public.contact, label: "Contact Store", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
