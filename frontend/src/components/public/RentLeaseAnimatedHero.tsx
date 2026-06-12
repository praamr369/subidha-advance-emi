import Link from "next/link";
import { ArrowRight, ClipboardCheck, PackageCheck, ShieldCheck, Wallet } from "lucide-react";

import GeneratedMarketingVisual from "@/components/public/GeneratedMarketingVisual";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type RentLeaseMode = "rent" | "lease";

type RentLeaseAnimatedHeroProps = {
  mode: RentLeaseMode;
  title: string;
  subtitle: string;
};

const modeCopy = {
  rent: {
    eyebrow: "Rent workflow",
    visualLabel: "Rent visual",
    visualSrc: "/marketing/generated/rent-lease-3d-room.webp",
    primaryCalloutTitle: "Short-term access",
    primaryCalloutText: "Usage without ownership",
    secondaryCalloutTitle: "Deposit control",
    secondaryCalloutText: "Refund subject to terms",
  },
  lease: {
    eyebrow: "Lease workflow",
    visualLabel: "Lease visual",
    visualSrc: "/marketing/generated/rent-lease-3d-room.webp",
    primaryCalloutTitle: "Longer tenure",
    primaryCalloutText: "Contract-backed access",
    secondaryCalloutTitle: "Return checks",
    secondaryCalloutText: "Condition-based closure",
  },
} as const;

const proofPoints = [
  {
    icon: PackageCheck,
    title: "No Lucky ID",
    description: "Rent and lease do not use Lucky IDs or draw-based winner benefits.",
  },
  {
    icon: Wallet,
    title: "Monthly invoice flow",
    description: "Monthly dues stay separate from Lucky Plan EMI and payment posting rules.",
  },
  {
    icon: ShieldCheck,
    title: "Deposit is controlled",
    description: "Security deposit treatment remains subject to inspection, refund, and policy checks.",
  },
] as const;

export default function RentLeaseAnimatedHero({ mode, title, subtitle }: RentLeaseAnimatedHeroProps) {
  const copy = modeCopy[mode];

  return (
    <section className="public-hero relative overflow-hidden p-5 sm:p-7 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(214,170,94,0.22),transparent_32%),radial-gradient(circle_at_16%_84%,rgba(112,72,42,0.14),transparent_34%)]" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <ClipboardCheck className="h-3.5 w-3.5 text-primary" />
            {copy.eyebrow}
          </div>

          <div className="space-y-4">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            <p className="max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
              {subtitle}
            </p>
            <div className="public-card-sm max-w-3xl px-4 py-3 text-sm leading-6 text-muted-foreground">
              <strong className="font-semibold text-foreground">Important:</strong> This page explains public rent/lease terms. Actual monthly collections, deposits, refunds, inspections, contracts, and ledger posture remain controlled inside the production workflow.
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={ROUTES.public.apply} className="public-action-primary gap-2">
              Apply / Enquire
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={ROUTES.public.products} className="public-action-secondary">
              View products
            </Link>
            <Link href={ROUTES.public.contact} className="public-action-secondary">
              Contact store
            </Link>
          </div>
        </div>

        <div className="relative">
          <GeneratedMarketingVisual
            src={copy.visualSrc}
            alt={`Decorative 3D ${mode} and lease furniture room visual`}
            label={copy.visualLabel}
            className="min-h-[22rem] lg:min-h-[30rem]"
          />
          <div className="pointer-events-none absolute -left-3 top-8 hidden rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{copy.primaryCalloutTitle}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{copy.primaryCalloutText}</div>
          </div>
          <div className="pointer-events-none absolute -right-3 bottom-8 hidden rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{copy.secondaryCalloutTitle}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{copy.secondaryCalloutText}</div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-6 grid gap-3 md:grid-cols-3">
        {proofPoints.map((point, index) => (
          <article
            key={point.title}
            className={cn(
              "public-card-sm public-card-animated px-4 py-4",
              index === 1 && "md:translate-y-3",
              index === 2 && "md:translate-y-1"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_14%,var(--surface-card-elevated)_86%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
                <point.icon className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold text-foreground">{point.title}</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{point.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
