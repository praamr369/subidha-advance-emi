import type { Metadata } from "next";
import Link from "next/link";

import CtaBanner from "@/components/public/CtaBanner";
import PoliciesHubHero from "@/components/public/PoliciesHubHero";
import PoliciesOperationalSummary from "@/components/public/PoliciesOperationalSummary";
import PoliciesRulesNavigator from "@/components/public/PoliciesRulesNavigator";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicPageShell from "@/components/public/PublicPageShell";
import { listPublicPolicies } from "@/lib/public-api";
import { PUBLIC_LEGAL_DISCLAIMER_POINTS } from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Business policies",
  description:
    "Published policy and customer rule hub for Lucky Plan, rent, lease, direct sale, delivery, warranty, payment, verification, and compliance guidance.",
  path: "/policies",
});

const routeMap: Record<string, string> = {
  terms: ROUTES.public.terms,
  privacy: ROUTES.public.privacy,
  "refund-cancellation": ROUTES.public.refundCancellation,
  warranty: ROUTES.public.warranty,
  "delivery-policy": ROUTES.public.deliveryPolicy,
  "rental-lease-policy": ROUTES.public.rentalLeasePolicy,
  "lucky-plan-policy": ROUTES.public.luckyPlanPolicy,
  "direct-sale-policy": ROUTES.public.directSalePolicy,
  "payment-policy": ROUTES.public.paymentPolicy,
  "service-policy": ROUTES.public.servicePolicy,
  grievance: ROUTES.public.grievance,
  "data-requests": ROUTES.public.dataRequests,
  "business-compliance": ROUTES.public.businessCompliance,
  "udyam-msme": ROUTES.public.udyamMsme,
};

export default async function PublicPoliciesPage() {
  const payload = await listPublicPolicies().catch(() => ({ count: 0, results: [] }));

  return (
    <PublicPageShell
      title="Business policies"
      subtitle="Read customer-facing rules and published legal pages before enquiry, payment, delivery, return, or contract signing."
      heroSlot={<PoliciesHubHero />}
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Business policies" },
      ]}
      actions={[
        { label: "Contact Store", href: ROUTES.public.contact, variant: "secondary" },
        { label: "Apply", href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <PoliciesRulesNavigator />
      <PoliciesOperationalSummary />

      <section className="public-surface p-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Published legal pages</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Admin-published policy pages</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground sm:text-base">
          These pages are published through the legal/policy workflow. Draft or archived legal text is not publicly visible.
        </p>

        {payload.results.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Policy pages are being reviewed and will be published soon. Until then, use the rule summaries above and contact the branch for transaction-specific clarification.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {payload.results.map((policy) => {
              const href = routeMap[policy.slug] || `/policies/${policy.slug}`;
              return (
                <article key={`${policy.slug}-${policy.version}`} className="public-card public-card-animated p-5">
                  <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span>{policy.category.replace(/_/g, " ")}</span>
                    <span>v{policy.version}</span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">{policy.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {policy.summary || "Published policy page"}
                  </p>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {policy.effective_date ? `Effective: ${policy.effective_date}` : "Effective date will be shown after publish review."}
                  </div>
                  <div className="mt-4">
                    <Link
                      href={href}
                      className="inline-flex rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
                    >
                      Read policy
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <PublicDisclaimerBox title="Public legal notice" points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Need clarification before payment or contract signing?"
        description="Contact Subidha Furniture for transaction-specific confirmation. Public policy pages do not create contracts, invoices, receipts, delivery records, or accounting entries."
        actions={[
          { href: ROUTES.public.contact, label: "Contact Store", variant: "secondary" },
          { href: ROUTES.public.products, label: "View Products", variant: "secondary" },
          { href: ROUTES.public.login, label: "Login", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
