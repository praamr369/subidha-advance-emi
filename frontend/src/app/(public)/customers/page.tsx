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
        { label: "View FAQ", href: ROUTES.public.faq, variant: "secondary" },
        { label: "Apply / Enquire", href: ROUTES.public.apply, variant: "primary" },
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
        eyebrow="Payment safety"
        title="How payment and receipts work"
        description="Your payment is only considered valid when an official receipt is generated. Do not treat any payment as complete without receipt confirmation."
        items={[
          {
            title: "Receipt-first validation",
            description: "A payment without a receipt should not be treated as a confirmed transaction.",
          },
          {
            title: "Auditable history",
            description:
              "Payment records are traceable with date, amount, method, and collected-by information.",
          },
          {
            title: "Portal visibility",
            description:
              "Receipts appear in your customer portal where you can review them at any time after login.",
          },
        ]}
      />

      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Ready to register as a customer?"
        description="Submit an enquiry, choose a product, and the branch team will guide you through registration and KYC."
        actions={[
          { href: ROUTES.public.products, label: "View products", variant: "secondary" },
          { href: ROUTES.public.faq, label: "View FAQ", variant: "secondary" },
          { href: ROUTES.public.apply, label: "Apply / Enquire", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
