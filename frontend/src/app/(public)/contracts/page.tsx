import type { Metadata } from "next";
import Link from "next/link";
import { FileText, CalendarDays, Home, ArrowRight } from "lucide-react";

import CtaBanner from "@/components/public/CtaBanner";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicPageShell from "@/components/public/PublicPageShell";
import RentLeaseComparison from "@/components/public/RentLeaseComparison";
import { PUBLIC_LEGAL_DISCLAIMER_POINTS } from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Contracts — Advance EMI, Rent, and Lease",
  description:
    "Understand the three contract types offered by Subidha Furniture: Advance EMI (Lucky Plan), Rent, and Lease. Compare features, obligations, and Lucky ID eligibility.",
  path: "/contracts",
});

const contractCards = [
  {
    href: ROUTES.public.contractsAdvanceEmi,
    icon: CalendarDays,
    eyebrow: "Lucky Plan",
    title: "Advance EMI",
    description:
      "Pay monthly instalments in advance, receive a Lucky ID, and participate in the transparent monthly draw. Winner benefit — if selected — waives remaining future EMI only. No winning is guaranteed.",
    tags: ["Lucky ID assigned", "Monthly draw", "Future EMI waiver if winner"],
    highlight: true,
  },
  {
    href: ROUTES.public.contractsRent,
    icon: Home,
    eyebrow: "Short-term access",
    title: "Rent",
    description:
      "Short-term furniture or appliance usage under a rental contract. Deposit is refundable subject to inspection. Rent does not create Lucky ID participation or draw eligibility.",
    tags: ["No Lucky ID", "Deposit required", "Usage-based"],
    highlight: false,
  },
  {
    href: ROUTES.public.contractsLease,
    icon: FileText,
    eyebrow: "Long-term access",
    title: "Lease",
    description:
      "Longer-term contract-backed access with fixed tenure and approval checkpoints. Upgrade and renewal require business approval. Lease does not create Lucky ID participation.",
    tags: ["No Lucky ID", "Approval-based upgrade", "Fixed tenure"],
    highlight: false,
  },
];

export default function ContractsHubPage() {
  return (
    <PublicPageShell
      title="Contracts"
      subtitle="Subidha Furniture offers three distinct contract types. Each has separate rules for deposit, monthly payment, Lucky ID eligibility, and ownership or access. Choose the one that fits your need."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Contracts" },
      ]}
      hero={{
        eyebrow: "Contract types",
        badges: ["Advance EMI", "Rent", "Lease"],
      }}
      actions={[
        { label: "Advance EMI (Lucky Plan)", href: ROUTES.public.contractsAdvanceEmi, variant: "primary" },
        { label: "Rent", href: ROUTES.public.contractsRent, variant: "secondary" },
        { label: "Lease", href: ROUTES.public.contractsLease, variant: "secondary" },
      ]}
    >
      <div className="grid gap-5 sm:grid-cols-3">
        {contractCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className={[
                "group flex flex-col gap-4 rounded-[2rem] border p-6 transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2",
                card.highlight
                  ? "border-primary/30 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--primary)_7%,white),color-mix(in_oklab,var(--primary)_3%,white))] shadow-[0_24px_70px_-50px_color-mix(in_oklab,var(--primary)_40%,transparent)]"
                  : "border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)]",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={[
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    card.highlight
                      ? "bg-primary/12 text-primary"
                      : "bg-[color-mix(in_oklab,var(--surface-muted)_80%,white)] text-muted-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1" aria-hidden="true" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{card.eyebrow}</div>
                <h2 className="mt-1 text-lg font-semibold text-foreground">{card.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
              </div>
              <div className="mt-auto flex flex-wrap gap-1.5">
                {card.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border/60 bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-border/50 dark:bg-[var(--surface-card-elevated)]/60 dark:text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      <section className="space-y-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Side-by-side</div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Rent vs Lease — key differences</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Both Rent and Lease provide usage access without Lucky ID or draw participation. See how they differ on tenure, deposit, and upgrade rules.
          </p>
        </div>
        <RentLeaseComparison />
      </section>

      <div className="rounded-[1.5rem] border border-amber-200/70 bg-amber-50/60 px-5 py-4 text-sm leading-6 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        <strong className="font-semibold">Important:</strong> Advance EMI (Lucky Plan), Rent, and Lease are separate contract types with distinct rules. A customer enrolled in Rent or Lease does not receive a Lucky ID, does not participate in the monthly draw, and is not eligible for an EMI waiver. Contract type is fixed at enrollment and cannot be changed retroactively.
      </div>

      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Not sure which contract suits you?"
        description="Talk to the branch team before enrolling. They can explain tenure fit, deposit requirements, and monthly payment comfort for each contract type."
        actions={[
          { href: ROUTES.public.contractsAdvanceEmi, label: "Advance EMI details", variant: "secondary" },
          { href: ROUTES.public.contractsRent, label: "Rent details", variant: "secondary" },
          { href: ROUTES.public.contractsLease, label: "Lease details", variant: "secondary" },
          { href: ROUTES.public.contact, label: "Contact store", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
