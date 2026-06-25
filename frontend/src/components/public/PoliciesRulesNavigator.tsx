import Link from "next/link";
import { ArrowRight, BadgeCheck, ClipboardCheck, PackageCheck, ReceiptText, ShieldCheck, Truck } from "lucide-react";

import { ROUTES } from "@/lib/routes";

const ruleGroups = [
  {
    icon: BadgeCheck,
    title: "Lucky Plan / Advance EMI",
    description: "Batch, Lucky ID, monthly EMI, winner publication, future EMI waiver, and cancellation boundaries.",
    href: ROUTES.public.luckyPlan,
    cta: "Read Lucky Plan",
  },
  {
    icon: PackageCheck,
    title: "Rent and lease",
    description: "Usage access, deposit, monthly dues, renewal, return inspection, and refund posture.",
    href: ROUTES.public.rent,
    cta: "Read rent rules",
  },
  {
    icon: ReceiptText,
    title: "Direct sale",
    description: "Invoice, receipt, ownership, delivery controls, return, exchange, and warranty expectations.",
    href: ROUTES.public.directSale,
    cta: "Read sale rules",
  },
  {
    icon: Truck,
    title: "Delivery and handover",
    description: "Address checks, receiver availability, handover evidence, visible damage reporting, and delays.",
    href: ROUTES.public.deliveryPolicy,
    cta: "Delivery policy",
  },
  {
    icon: ShieldCheck,
    title: "Payment and receipt safety",
    description: "Accepted payment modes, official receipts, correction boundaries, refund controls, and customer dashboard access.",
    href: ROUTES.public.paymentPolicy,
    cta: "Payment policy",
  },
  {
    icon: ClipboardCheck,
    title: "KYC, service, and compliance",
    description: "Verification, warranty, support channels, grievance, data requests, and business compliance pages.",
    href: ROUTES.public.businessCompliance,
    cta: "Compliance",
  },
] as const;

export default function PoliciesRulesNavigator() {
  return (
    <section className="public-surface p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Rules navigator</div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Find the right policy before you proceed</h2>
      <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground sm:text-base">
        Use this hub to choose the correct rule path. Public navigation helps customers understand workflows; it does not approve applications, reserve stock, create payments, or generate documents.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ruleGroups.map((group) => (
          <article key={group.title} className="public-card public-card-animated p-5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface-card-elevated)_87%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
              <group.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">{group.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{group.description}</p>
            <Link href={group.href} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-primary/80">
              {group.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
