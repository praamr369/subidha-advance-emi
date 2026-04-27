import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicBanner from "@/components/public/PublicBanner";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicPolicySection from "@/components/public/PublicPolicySection";
import PublicPageShell from "@/components/public/PublicPageShell";
import { DIRECT_SALE_POLICY, PUBLIC_LEGAL_DISCLAIMER_POINTS, READ_BEFORE_APPLY } from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Direct sale policy",
  description: "Understand invoice, payment, delivery, ownership, and warranty expectations for direct sale.",
  path: "/direct-sale",
});

export default function DirectSalePolicyPage() {
  return (
    <PublicPageShell
      title="Direct sale policy"
      subtitle="Professional invoice and receipt-backed purchase flow with transparent delivery and service expectations."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Direct sale policy" },
      ]}
      actions={[
        { label: "Apply Now", href: ROUTES.public.apply, variant: "primary" },
        { label: "Contact Store", href: ROUTES.public.contact, variant: "secondary" },
      ]}
    >
      <PublicBanner
        eyebrow="Read before applying"
        title="Direct sale terms depend on invoice and product condition"
        description="Please review return, warranty, payment, and delivery expectations before purchase."
      />
      <PublicDisclaimerBox title="Read before applying" points={READ_BEFORE_APPLY.directSale} />
      <PublicPolicySection
        id="direct-sale-policy"
        title={DIRECT_SALE_POLICY.title}
        intro={DIRECT_SALE_POLICY.intro}
        cards={DIRECT_SALE_POLICY.cards}
      />
      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />
      <CtaBanner
        title="Compare Direct Sale with plan options"
        description="Choose purchase flow based on ownership priority, payment mode, and delivery timeline."
        actions={[
          { href: ROUTES.public.products, label: "View Products", variant: "secondary" },
          { href: ROUTES.public.contact, label: "Contact Store", variant: "secondary" },
          { href: ROUTES.public.login, label: "Login to Customer Dashboard", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
