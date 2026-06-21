import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import ProcessTimeline from "@/components/public/ProcessTimeline";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import TrustPillars from "@/components/public/TrustPillars";
import {
  CUSTOMERS_PAGE_CONTENT,
  CUSTOMER_LIMITATIONS,
  CUSTOMER_MULTI_CONTRACT_INFO,
  PUBLIC_LEGAL_DISCLAIMER_POINTS,
} from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Customers",
  description:
    "How customer registration works, what the customer portal provides, what documents to keep, and how payments and receipts are tracked.",
  path: "/customers",
});

export default function CustomersPage() {
  return (
    <PublicPageShell
      title="Customer Guide"
      subtitle="Everything you need to know about registering, enrolling in a plan, paying monthly, and tracking your records — before you join."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Customers" },
      ]}
      hero={{
        eyebrow: "For customers",
        badges: ["Registration", "Payments", "Portal access", "Document safety"],
      }}
      actions={[
        { label: "Explore Contracts", href: ROUTES.public.contracts, variant: "secondary" },
        { label: "Login", href: ROUTES.public.login, variant: "primary" },
      ]}
    >
      <section className="space-y-4">
        <SectionHeader
          eyebrow="How to get started"
          title="Customer registration — step by step"
          description="From first enquiry to your first payment receipt."
        />
        <ProcessTimeline steps={CUSTOMERS_PAGE_CONTENT.registrationSteps} />
      </section>

      <PublicMarketingBanner
        eyebrow="Customer portal"
        title="What you can see after login"
        description="Once you are a registered customer with an approved contract, you can log in to the customer portal to view your full history."
        items={[
          {
            title: "Contracts and Lucky IDs",
            description: "View your active subscriptions, contract details, and assigned Lucky IDs.",
          },
          {
            title: "Payment history and receipts",
            description:
              "Every receipted payment appears in your portal. You can view and download your receipt history at any time.",
          },
          {
            title: "Delivery and support",
            description:
              "Track your delivery status, handover documents, and submit or view support requests.",
          },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Portal features"
          title="Full list of what the customer dashboard provides"
        />
        <div className="public-surface p-6">
          <ul className="grid gap-3 sm:grid-cols-2" role="list">
            {CUSTOMERS_PAGE_CONTENT.whatCustomerPortalProvides.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <span
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--primary)_14%,white)] text-[10px] font-bold text-primary"
                  aria-hidden="true"
                >
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Multiple contracts"
          title="Multiple contracts and multiple Lucky IDs"
          description="What happens when a customer holds more than one contract or more than one Lucky ID."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <article className="public-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Multiple contracts</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {CUSTOMER_MULTI_CONTRACT_INFO.multipleContracts}
            </p>
          </article>
          <article className="public-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Multiple Lucky IDs</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {CUSTOMER_MULTI_CONTRACT_INFO.multipleLuckyIds}
            </p>
          </article>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="What customers cannot do"
          title="Customer limitations — for your protection"
          description="These limitations are part of the controlled workflow that keeps your financial records safe and auditable."
        />
        <div className="rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)]">
          <ul className="grid gap-3 sm:grid-cols-2" role="list">
            {CUSTOMER_LIMITATIONS.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-red-200/70 bg-red-50 text-[10px] font-bold text-red-600"
                  aria-hidden="true"
                >
                  ✕
                </span>
                <span className="text-sm leading-6 text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            These restrictions ensure that payment records, delivery authorisations, and accounting entries remain controlled by authorised branch staff — protecting both the customer and the business.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Document safety"
          title="Documents every customer should keep"
          description="Digital records in the portal are helpful, but always keep physical copies of signed documents."
        />
        <div className="public-surface p-6">
          <ul className="grid gap-3 sm:grid-cols-2" role="list">
            {CUSTOMERS_PAGE_CONTENT.documentsToKeep.map((doc) => (
              <li key={doc} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-[color-mix(in_oklab,var(--primary)_10%,white)] text-[10px] font-bold text-primary"
                  aria-hidden="true"
                >
                  ★
                </span>
                <span className="text-sm leading-6 text-muted-foreground">{doc}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <TrustPillars />

      <PublicMarketingBanner
        eyebrow="Why digital proof matters"
        title="Digital contract tracking is safer than informal paper registers"
        description="A structured digital system means your payment, contract, and receipt history is traceable, date-stamped, and preserved — unlike informal handwritten registers that can be lost or disputed."
        items={[
          {
            title: "Receipt-first validation",
            description: "A payment without a digital receipt should not be treated as a confirmed transaction.",
          },
          {
            title: "Auditable history",
            description:
              "Payment records are traceable with date, amount, method, and collected-by information.",
          },
          {
            title: "Portal visibility",
            description:
              "Receipts and contracts appear in your customer portal where you can review them at any time after login.",
          },
        ]}
      />

      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Ready to explore your options?"
        description="Browse contracts to understand which plan suits you, then contact the branch or log in to your existing account."
        actions={[
          { href: ROUTES.public.contracts, label: "Explore Contracts", variant: "secondary" },
          { href: ROUTES.public.contact, label: "Contact Store", variant: "secondary" },
          { href: ROUTES.public.faq, label: "View FAQ", variant: "secondary" },
          { href: ROUTES.public.login, label: "Login", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
