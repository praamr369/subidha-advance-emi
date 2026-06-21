import type { Metadata } from "next";
import Link from "next/link";

import CtaBanner from "@/components/public/CtaBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import { PUBLIC_LEGAL_DISCLAIMER_POINTS } from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Disclaimer",
  description:
    "Public disclaimer for Subidha Furniture — what this website covers, what it does not promise, and how final terms are governed.",
  path: "/legal/disclaimer",
});

const sections = [
  {
    id: "website-purpose",
    title: "Purpose of this website",
    paragraphs: [
      "This website (Subidha CORE public site) is published by Subidha Furniture for the purpose of explaining products, plan options (Lucky Plan EMI, Rent, Lease, Direct Sale), policies, and customer/partner information to the public.",
      "The content on this site is for informational purposes only. It does not constitute a legally binding contract, offer, guarantee, or financial product unless explicitly stated in a signed document.",
    ],
  },
  {
    id: "no-guarantee",
    title: "No guarantee of winning",
    paragraphs: [
      "Lucky Plan (Advance EMI) participation does not guarantee winning the monthly lucky draw. The draw is conducted under published rules. A Lucky ID assignment does not create any entitlement to a prize or waiver.",
      "Winner benefit — if a customer's Lucky ID is selected — applies only to future EMI obligations from the approved winning month onward. Already-paid EMI is not automatically reversed or refunded.",
    ],
  },
  {
    id: "not-gambling",
    title: "Lucky Plan is not gambling",
    paragraphs: [
      "Lucky Plan is a structured monthly instalment payment plan (Advance EMI) attached to a real product purchase contract. Participation is not a wager or game of chance. The draw feature is a transparent, auditable benefit mechanism governed by published rules and customer contracts.",
    ],
  },
  {
    id: "no-government-approval",
    title: "No claimed government approval",
    paragraphs: [
      "Subidha Furniture does not claim government endorsement, RBI registration, SEBI regulation, or any regulatory approval for the Lucky Plan unless a specific approval document is separately published. The business operates as a registered local retail entity (MSME/Udyam registered; see Udyam/MSME page for details).",
    ],
  },
  {
    id: "deposit-refund",
    title: "Deposit refund and rent/lease",
    paragraphs: [
      "Security deposits for rent or lease are refundable liabilities subject to return inspection, pending dues clearance, damage assessment, and business approval. Refund is not automatic and may be reduced by approved deductions.",
    ],
  },
  {
    id: "delivery-warranty",
    title: "Delivery and warranty",
    paragraphs: [
      "Delivery schedules depend on stock availability, payment verification, KYC status, and operational readiness. Warranty and service coverage depends on product category, vendor/brand terms, and approved contract conditions.",
    ],
  },
  {
    id: "authoritative-documents",
    title: "Authoritative documents",
    paragraphs: [
      "Final rights and obligations for any customer or partner are governed by the following, in order: (1) signed approved contract or invoice, (2) official receipt records, (3) delivery/handover documents, (4) official business policy documents.",
      "If any content on this public website conflicts with an approved contract or official policy document, the contract and policy document take precedence.",
    ],
  },
  {
    id: "public-content-limits",
    title: "Limits of public content",
    paragraphs: [
      "Public pages do not create contracts, post payments, alter ledgers, trigger payouts, or change winner records. Any action that appears to do so on the public site is for demonstration or explanation purposes only.",
      "Real payment, receipt, contract, delivery, and accounting operations are controlled inside the authenticated core system.",
    ],
  },
  {
    id: "contact",
    title: "Questions and contact",
    paragraphs: [
      "For any questions about this disclaimer or the business's policies, please contact Subidha Furniture directly through the Contact page before making any payment, signing any document, or enrolling in any plan.",
    ],
  },
] as const;

export default function DisclaimerPage() {
  return (
    <PublicPageShell
      title="Public Disclaimer"
      subtitle="Read this disclaimer to understand what this website covers, what it does not promise, and how final terms are determined."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Legal", href: ROUTES.public.terms },
        { label: "Disclaimer" },
      ]}
      hero={{
        eyebrow: "Legal information",
        legalVariant: true,
        compact: true,
      }}
      actions={[
        { label: "Terms of use", href: ROUTES.public.terms, variant: "secondary" },
        { label: "Privacy policy", href: ROUTES.public.privacy, variant: "secondary" },
      ]}
    >
      <div className="public-surface space-y-1 p-2">
        <nav aria-label="Disclaimer sections" className="flex flex-wrap gap-2 p-4">
          {sections.map((section) => (
            <Link
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_88%,transparent)] px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            >
              {section.title}
            </Link>
          ))}
        </nav>
      </div>

      <div className="space-y-6">
        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="public-card-sm p-5"
          >
            <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
            <div className="mt-3 space-y-3">
              {section.paragraphs.map((para, i) => (
                <p key={i} className="text-sm leading-7 text-muted-foreground">
                  {para}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="rounded-[1.5rem] border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_90%,transparent)] p-5">
        <h2 className="text-sm font-semibold text-foreground">Summary disclaimer points</h2>
        <ul className="mt-3 space-y-2" role="list">
          {PUBLIC_LEGAL_DISCLAIMER_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-sm leading-6 text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
              {point}
            </li>
          ))}
        </ul>
      </div>

      <CtaBanner
        title="Have questions before enrolling?"
        description="Contact the store before signing any contract or making any payment. We are happy to answer questions about our plans, policies, and documents."
        actions={[
          { href: ROUTES.public.contact, label: "Contact store", variant: "secondary" },
          { href: ROUTES.public.faq, label: "View FAQ", variant: "secondary" },
          { href: ROUTES.public.terms, label: "Terms of use", variant: "secondary" },
          { href: ROUTES.public.apply, label: "Apply / Enquire", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
