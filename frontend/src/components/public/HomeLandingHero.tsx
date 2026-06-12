import Link from "next/link";
import { ArrowRight, BadgeCheck, ReceiptText, ShieldCheck, Sparkles } from "lucide-react";

import GeneratedMarketingVisual from "@/components/public/GeneratedMarketingVisual";
import { brandConfig } from "@/config/brand";
import { PUBLIC_MARKETING_ASSETS } from "@/lib/public-marketing-assets";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type HomeLandingHeroStats = {
  total_batches: number;
  active_subscriptions: number;
  total_winners: number;
} | null;

type HomeLandingHeroProps = {
  title: string;
  subtitle: string;
  companyName: string;
  tagline: string;
  stats: HomeLandingHeroStats;
};

const trustPoints = [
  {
    icon: ShieldCheck,
    title: "Transparent plan rules",
    description: "Know tenure, EMI and winner benefit scope before enrollment.",
  },
  {
    icon: ReceiptText,
    title: "Receipted monthly payments",
    description: "Payments stay separate from public marketing and are tracked inside the portal.",
  },
  {
    icon: BadgeCheck,
    title: "Rent / Lease ready",
    description: "Public messaging supports EMI, rent, lease and direct-sale discovery.",
  },
] as const;

export default function HomeLandingHero({ title, subtitle, companyName, tagline, stats }: HomeLandingHeroProps) {
  const heroStats = stats
    ? [
        { label: "Published batches", value: stats.total_batches.toLocaleString("en-IN") },
        { label: "Active subscriptions", value: stats.active_subscriptions.toLocaleString("en-IN") },
        { label: "Published winners", value: stats.total_winners.toLocaleString("en-IN") },
      ]
    : [];

  return (
    <section className="public-hero relative overflow-hidden p-5 sm:p-7 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(214,170,94,0.22),transparent_30%),radial-gradient(circle_at_18%_80%,rgba(112,72,42,0.12),transparent_34%)]" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {companyName} · {brandConfig.publicBranchLocation}
          </div>

          <div className="space-y-4">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              {subtitle}
            </p>
            <p className="max-w-2xl text-sm font-semibold leading-6 text-foreground/80">
              {tagline}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={ROUTES.public.apply} className="public-action-primary gap-2">
              Apply / Enquire
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={ROUTES.public.products} className="public-action-secondary">
              Explore products
            </Link>
            <Link href={ROUTES.public.luckyPlan} className="public-action-secondary">
              View Lucky Plan
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {heroStats.length > 0 ? (
              heroStats.map((item) => (
                <div key={item.label} className="public-card-sm px-4 py-3">
                  <div className="text-2xl font-semibold tracking-tight text-foreground">{item.value}</div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{item.label}</div>
                </div>
              ))
            ) : (
              <div className="public-card-sm px-4 py-3 text-sm leading-6 text-muted-foreground sm:col-span-3">
                Live public statistics are unavailable right now. No placeholder business numbers are shown.
              </div>
            )}
          </div>
        </div>

        <div className="relative">
          <GeneratedMarketingVisual asset={PUBLIC_MARKETING_ASSETS.heroShowroom} priority className="min-h-[22rem] lg:min-h-[31rem]" />
          <div className="pointer-events-none absolute -left-4 top-8 hidden rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Lucky Plan</div>
            <div className="mt-1 text-sm font-semibold text-foreground">Future EMI waiver only</div>
          </div>
          <div className="pointer-events-none absolute -right-2 bottom-8 hidden rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Rent / Lease</div>
            <div className="mt-1 text-sm font-semibold text-foreground">Monthly invoice workflow</div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-6 grid gap-3 md:grid-cols-3">
        {trustPoints.map((point, index) => (
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
