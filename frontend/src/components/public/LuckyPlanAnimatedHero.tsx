import Link from "next/link";
import { ArrowRight, BadgeCheck, ShieldCheck, Sparkles, Wallet } from "lucide-react";

import GeneratedMarketingVisual from "@/components/public/GeneratedMarketingVisual";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type LuckyPlanAnimatedHeroProps = {
  title: string;
  subtitle: string;
};

const proofPoints = [
  {
    icon: Wallet,
    title: "15-month structure",
    description: "Customer commitment stays based on the approved product contract value and tenure.",
  },
  {
    icon: Sparkles,
    title: "Lucky ID per batch",
    description: "Lucky ID assignment remains tied to controlled batch records, not public page decoration.",
  },
  {
    icon: ShieldCheck,
    title: "Future EMI waiver only",
    description: "Winner benefit never rewrites already settled payment history.",
  },
] as const;

export default function LuckyPlanAnimatedHero({ title, subtitle }: LuckyPlanAnimatedHeroProps) {
  return (
    <section className="public-hero relative overflow-hidden p-5 sm:p-7 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(214,170,94,0.24),transparent_32%),radial-gradient(circle_at_16%_84%,rgba(112,72,42,0.14),transparent_34%)]" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <BadgeCheck className="h-3.5 w-3.5 text-primary" />
            Advance EMI · Lucky Plan
          </div>

          <div className="space-y-4">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            <p className="max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
              {subtitle}
            </p>
            <div className="public-card-sm max-w-3xl px-4 py-3 text-sm leading-6 text-muted-foreground">
              <strong className="font-semibold text-foreground">Important:</strong> Lucky Plan is explained here for customer understanding. Actual subscription creation, EMI records, payment receipts, winner reveal, and waiver posting remain controlled inside the core system.
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={ROUTES.public.apply} className="public-action-primary gap-2">
              Apply / Enquire
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={ROUTES.public.fairDraw} className="public-action-secondary">
              View fair draw
            </Link>
            <Link href={ROUTES.public.winners} className="public-action-secondary">
              Published winners
            </Link>
          </div>
        </div>

        <div className="relative">
          <GeneratedMarketingVisual
            src="/marketing/generated/lucky-plan-3d-card.webp"
            alt="Decorative 3D Lucky Plan cards and furniture EMI visual"
            label="Lucky Plan visual"
            className="min-h-[22rem] lg:min-h-[30rem]"
          />
          <div className="pointer-events-none absolute -left-3 top-8 hidden rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Lucky IDs</div>
            <div className="mt-1 text-sm font-semibold text-foreground">00–99 per batch</div>
          </div>
          <div className="pointer-events-none absolute -right-3 bottom-8 hidden rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Winner benefit</div>
            <div className="mt-1 text-sm font-semibold text-foreground">Future EMI only</div>
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
