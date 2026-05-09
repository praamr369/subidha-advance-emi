import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicBanner from "@/components/public/PublicBanner";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicPolicySection from "@/components/public/PublicPolicySection";
import PublicProcessTimeline from "@/components/public/PublicProcessTimeline";
import PublicTrustBadgeGrid from "@/components/public/PublicTrustBadgeGrid";
import PublicPageShell from "@/components/public/PublicPageShell";
import { Typography } from "@/components/ui/typography";
import {
  ADVANCE_EMI_POLICY,
  GENERIC_POLICIES,
  LEASE_POLICY,
  POLICY_TIMELINE,
  PUBLIC_LEGAL_DISCLAIMER_POINTS,
  PUBLIC_PURPOSE_BADGES,
  RENT_POLICY,
} from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Business policies",
  description:
    "Public-facing business, payment, delivery, warranty, KYC, and customer education policies for Subidha Furniture.",
  path: "/policies",
});

export default function PublicPoliciesPage() {
  return (
    <PublicPageShell
      title="Business policies and customer education"
      subtitle="Public explanation layer for products, contracts, payments, delivery, warranty, service, and verification rules."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Business policies" },
      ]}
      actions={[
        { label: "Apply Now", href: ROUTES.public.apply, variant: "primary" },
        { label: "Contact Store", href: ROUTES.public.contact, variant: "secondary" },
      ]}
    >
      <PublicBanner
        eyebrow="Our purpose"
        title="Subidha Furniture provides four structured customer paths"
        description="Advance EMI/Lucky Plan, Rent, Lease, and Direct Sale are built for different household needs with transparent records."
      />
      <PublicTrustBadgeGrid items={PUBLIC_PURPOSE_BADGES} />

      <PublicProcessTimeline steps={[...POLICY_TIMELINE]} />

      <PublicPolicySection
        id="advance-emi"
        title={ADVANCE_EMI_POLICY.title}
        intro={ADVANCE_EMI_POLICY.intro}
        cards={ADVANCE_EMI_POLICY.cards}
      />
      <PublicPolicySection id="rent" title={RENT_POLICY.title} intro={RENT_POLICY.intro} cards={RENT_POLICY.cards} />
      <PublicPolicySection id="lease" title={LEASE_POLICY.title} intro={LEASE_POLICY.intro} cards={LEASE_POLICY.cards} />

      <section className="public-surface p-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Additional public rules</div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {Object.values(GENERIC_POLICIES).map((policy) => (
            <article key={policy.title} className="public-card p-5">
              <h2 className="text-lg font-semibold text-foreground">{policy.title}</h2>
              <Typography className="mt-3">
                <ul className="space-y-2">
                  {policy.points.map((point) => (
                    <li key={point} className="rounded-lg border border-white/75 bg-white/70 px-3 py-2">
                      {point}
                    </li>
                  ))}
                </ul>
              </Typography>
            </article>
          ))}
        </div>
      </section>

      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Need exact term clarification before payment?"
        description="Please contact the branch for product-specific contract, invoice, warranty, and eligibility confirmation."
        actions={[
          { href: ROUTES.public.contact, label: "Contact Store", variant: "secondary" },
          { href: ROUTES.public.products, label: "View Products", variant: "secondary" },
          { href: ROUTES.public.login, label: "Login to Customer Dashboard", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
