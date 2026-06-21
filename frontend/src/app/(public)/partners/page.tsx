import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { PARTNERS_PAGE_CONTENT, PUBLIC_LEGAL_DISCLAIMER_POINTS } from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Partners",
  description:
    "Understand the partner role at Subidha Furniture — how partners connect customers, how commissions work, and what the partner portal provides.",
  path: "/partners",
});

export default function PartnersPage() {
  return (
    <PublicPageShell
      title="Partner Program"
      subtitle={PARTNERS_PAGE_CONTENT.roleExplanation}
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Partners" },
      ]}
      hero={{
        eyebrow: "For partners",
        badges: ["Partner role", "Commission workflow", "Partner portal"],
      }}
      actions={[
        { label: "Contact Store", href: ROUTES.public.contact, variant: "secondary" },
        { label: "Login", href: ROUTES.public.login, variant: "primary" },
      ]}
    >
      <section className="space-y-4">
        <SectionHeader
          eyebrow="What partners do"
          title="Partner role explained"
          description="Partners help connect customers with Subidha Furniture's products and plans. All enrollment, contract, and commission workflows remain controlled inside the business system."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {PARTNERS_PAGE_CONTENT.keyPoints.map((point) => (
            <article key={point.title} className="public-card public-card-animated p-5">
              <h3 className="text-sm font-semibold text-foreground">{point.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{point.description}</p>
            </article>
          ))}
        </div>
      </section>

      <PublicMarketingBanner
        eyebrow="Commission workflow"
        title="How partner commissions are handled"
        description="Commission calculation, approval, and payout are internal controlled workflows. Partners can view their commission records in the partner portal but cannot self-approve or self-post payouts. No guaranteed commission or instant payout is promised."
        items={[
          {
            title: "Controlled internal process",
            description:
              "Commissions are calculated based on approved partnership terms and customer onboarding status.",
          },
          {
            title: "No self-approval of payout",
            description:
              "A partner cannot approve their own payout. Payout batches require business approval before processing.",
          },
          {
            title: "Partner portal visibility",
            description:
              "Partners can view their commission records, introduced customers, and subscription statuses after login — but cannot trigger or post payments.",
          },
        ]}
      />

      <PublicMarketingBanner
        eyebrow="Subject to store approval"
        title="Partner work requires store approval at every stage"
        description="Partner roles, commission structures, and payout processing are all subject to business approval. Partners are not employees or agents of the business and cannot act on behalf of the business without explicit authorisation."
        items={[
          {
            title: "Activation requires approval",
            description: "Becoming an active partner requires business review and signed agreement. Enquiry does not activate partner status.",
          },
          {
            title: "No guaranteed commission",
            description:
              "Commission eligibility depends on approved terms, customer onboarding status, and business verification — not solely on introductions made.",
          },
          {
            title: "No accounting entries by partners",
            description:
              "Partners cannot post accounting entries, approve financial records, or alter any customer payment or contract data.",
          },
        ]}
      />

      <div className="rounded-[1.5rem] border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_88%,transparent)] p-5 text-sm leading-6 text-muted-foreground">
        <strong className="block font-semibold text-foreground">Important notice</strong>
        <p className="mt-2">{PARTNERS_PAGE_CONTENT.disclaimer}</p>
      </div>

      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Interested in becoming a partner?"
        description="Contact the branch to discuss partnership eligibility and terms. Partnership activation requires business approval."
        actions={[
          { href: ROUTES.public.contact, label: "Contact Store", variant: "secondary" },
          { href: ROUTES.public.contracts, label: "Explore Contracts", variant: "secondary" },
          { href: ROUTES.public.login, label: "Login", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
