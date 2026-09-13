import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, MapPin, ReceiptText, ShieldCheck } from "lucide-react";

import type { HomeCopy } from "@/components/public/home/home-copy";
import { tone } from "@/components/public/ui/tone";
import { brandConfig } from "@/config/brand";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { PublicStats } from "@/services/public";

type HomeHeroProps = {
  copy: HomeCopy["hero"];
  title: string;
  subtitle: string;
  companyName: string;
  stats: PublicStats | null;
};

const PROMISE_ICONS = [ReceiptText, ShieldCheck, BadgeCheck] as const;

/**
 * Static, server-rendered hero. Deliberately has no pointer/scroll listeners
 * or looping animation so the page paints fast and stays still on low-end phones.
 */
export default function HomeHero({ copy, title, subtitle, companyName, stats }: HomeHeroProps) {
  const liveFigures = stats
    ? [
        { value: stats.batch_available_seats || 0, label: copy.figures.seats },
        { value: stats.active_subscriptions, label: copy.figures.members },
        { value: stats.total_winners, label: copy.figures.winners },
      ]
    : [];

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[1.75rem] border shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-28px_rgba(15,23,42,0.35)]",
        tone.surface,
        tone.line
      )}
    >
      <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="flex flex-col justify-center gap-6 p-6 sm:p-10 lg:p-12">
          <p className={cn("inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", tone.line, tone.wash, tone.muted)}>
            <MapPin className={cn("h-3.5 w-3.5", tone.accentText)} aria-hidden="true" />
            {companyName} · {brandConfig.publicBranchLocation}
          </p>

          <h1 className={cn("text-balance text-3xl font-semibold leading-[1.18] tracking-tight sm:text-4xl lg:text-5xl", tone.text)}>
            {title}
          </h1>
          <p className={cn("max-w-xl text-base leading-7 sm:text-lg sm:leading-8", tone.muted)}>{subtitle}</p>

          <div className="flex flex-wrap gap-3">
            <Link href={ROUTES.public.products} className="public-action-primary gap-2">
              {copy.explore}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="#plans" className="public-action-secondary">
              {copy.compare}
            </Link>
            <Link href={ROUTES.public.apply} className="public-action-secondary">
              {copy.apply}
            </Link>
          </div>

          <ul className={cn("flex flex-wrap gap-x-6 gap-y-2 border-t pt-5 text-sm font-medium", tone.line, tone.textSoft)}>
            {copy.promises.map((label, index) => {
              const Icon = PROMISE_ICONS[index];
              return (
                <li key={label} className="inline-flex items-center gap-2">
                  <Icon className={cn("h-4 w-4", tone.accentText)} aria-hidden="true" />
                  {label}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative min-h-[17rem] sm:min-h-[22rem] lg:min-h-[34rem]">
          <Image
            src="/images/hero_living_room.jpg"
            alt={copy.imageAlt}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 46vw"
            className="object-cover"
          />
          {liveFigures.length > 0 ? (
            <dl className="absolute inset-x-3 bottom-3 grid grid-cols-3 divide-x divide-white/15 rounded-2xl bg-slate-950/80 py-3 text-white sm:inset-x-6 sm:bottom-6">
              {liveFigures.map((figure) => (
                <div key={figure.label} className="flex flex-col-reverse px-2 text-center sm:px-3">
                  <dt className="mt-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] text-white/70 sm:text-[11px]">
                    {figure.label}
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums sm:text-2xl">{figure.value.toLocaleString("en-IN")}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </section>
  );
}
