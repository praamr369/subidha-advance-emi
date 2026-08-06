import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import Link from "next/link";
import { ArrowRight, BadgeCheck, FileCheck2, ShieldCheck, Sparkles } from "lucide-react";

import Image from "next/image";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type DrawTransparencyMode = "winners" | "history" | "fairDraw" | "certificate";

type DrawTransparencyHeroProps = {
  mode: DrawTransparencyMode;
  title: string;
  subtitle: string;
};





export default async function DrawTransparencyHero({ mode, title, subtitle }: DrawTransparencyHeroProps) {
  const locale = await getPublicLocale();
  const dict = getPublicDictionary(locale);

const modeCopy = {
  winners: {
    eyebrow: dict.public.DrawTransparencyHero_prop1,
    primaryLabel: "Winner history",
    primaryHref: ROUTES.public.winnerHistory,
    secondaryLabel: "Fair Draw",
    secondaryHref: ROUTES.public.fairDraw,
    calloutTitle: "Masked display",
    calloutText: "Privacy-safe records",
  },
  history: {
    eyebrow: dict.public.DrawTransparencyHero_prop2,
    primaryLabel: "Latest winners",
    primaryHref: ROUTES.public.winners,
    secondaryLabel: "Fair Draw",
    secondaryHref: ROUTES.public.fairDraw,
    calloutTitle: "Archive view",
    calloutText: "Backend records only",
  },
  fairDraw: {
    eyebrow: dict.public.DrawTransparencyHero_prop3,
    primaryLabel: "Published winners",
    primaryHref: ROUTES.public.winners,
    secondaryLabel: "Lucky Plan rules",
    secondaryHref: ROUTES.public.luckyPlan,
    calloutTitle: "Commit first",
    calloutText: "Reveal later",
  },
  certificate: {
    eyebrow: dict.public.DrawTransparencyHero_prop4,
    primaryLabel: "All winners",
    primaryHref: ROUTES.public.winners,
    secondaryLabel: "Fair Draw home",
    secondaryHref: ROUTES.public.fairDraw,
    calloutTitle: "Verification detail",
    calloutText: "Public fields only",
  },
} as const;

const proofPoints = [
  {
    icon: FileCheck2,
    title: dict.public.DrawTransparencyHero_prop5,
    description: dict.public.DrawTransparencyHero_prop6,
  },
  {
    icon: ShieldCheck,
    title: dict.public.DrawTransparencyHero_prop7,
    description: dict.public.DrawTransparencyHero_prop8,
  },
  {
    icon: BadgeCheck,
    title: dict.public.DrawTransparencyHero_prop9,
    description: dict.public.DrawTransparencyHero_prop10,
  },
] as const;

  const copy = modeCopy[mode];

  return (
    <section className="public-hero relative overflow-hidden p-5 sm:p-7 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(214,170,94,0.22),transparent_32%),radial-gradient(circle_at_16%_84%,rgba(112,72,42,0.14),transparent_34%)]" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
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
              <strong className="font-semibold text-foreground">{dict.public.DrawTransparencyHero_text11}</strong> Draw transparency pages are read-only. They never select winners, assign Lucky IDs, create waivers, collect payments, or alter EMI records.
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={copy.primaryHref} className="public-action-primary gap-2">
              {copy.primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={copy.secondaryHref} className="public-action-secondary">
              {copy.secondaryLabel}
            </Link>
            <Link href={ROUTES.public.contact} className="public-action-secondary">
              Ask branch
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="relative w-full overflow-hidden rounded-[1.6rem] shadow-[0_24px_54px_-24px_rgba(15,23,42,0.6)]">
            <Image
              src="/images/banner_draw.jpg"
              alt={dict.public.DrawTransparencyHero_attr14}
              width={800}
              height={533}
              priority
              className="w-full object-cover min-h-[22rem] lg:min-h-[30rem]"
            />
          </div>
          <div className="pointer-events-none absolute -left-3 top-8 hidden rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{copy.calloutTitle}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{copy.calloutText}</div>
          </div>
          <div className="pointer-events-none absolute -right-3 bottom-8 hidden rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{dict.public.DrawTransparencyHero_text15}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{dict.public.DrawTransparencyHero_text16}</div>
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
