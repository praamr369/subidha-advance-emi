import Link from "next/link";
import { CheckCircle2, Layers, ShieldCheck, Store, Wallet } from "lucide-react";

import type { HomeCopy } from "@/components/public/home/home-copy";
import { tone } from "@/components/public/ui/tone";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const PILLAR_ICONS = [Wallet, ShieldCheck, Store, Layers] as const;

const COMMITMENT_LINKS = [
  ROUTES.public.paymentPolicy,
  ROUTES.public.paymentPolicy,
  ROUTES.public.verifyDraw,
  ROUTES.public.privacy,
  ROUTES.public.deliveryPolicy,
  ROUTES.public.grievance,
] as const;

export default function HomeVision({ copy }: { copy: HomeCopy["vision"] }) {
  return (
    <section
      id="vision"
      aria-label={copy.eyebrow}
      className={cn("scroll-mt-24 overflow-hidden rounded-[1.75rem] border lg:scroll-mt-64", tone.surface, tone.line)}
    >
      <div className={cn("px-6 py-10 sm:px-10 sm:py-12", tone.fill)}>
        <p className={cn("text-xs font-semibold uppercase tracking-[0.14em]", tone.onFillMuted)}>{copy.eyebrow}</p>
        <h2 className="mt-3 max-w-4xl text-balance text-2xl font-semibold leading-snug sm:text-3xl lg:text-4xl">{copy.statement}</h2>
        <p className={cn("mt-4 max-w-3xl text-sm leading-7 sm:text-base", tone.onFillMuted)}>{copy.about}</p>
      </div>

      <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <p className={cn("text-xs font-semibold uppercase tracking-[0.14em]", tone.accentText)}>{copy.strategyEyebrow}</p>
          <h3 className={cn("mt-2 text-xl font-semibold", tone.text)}>{copy.strategyTitle}</h3>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {copy.pillars.map((pillar, index) => {
              const Icon = PILLAR_ICONS[index];
              return (
                <article key={pillar.title} className={cn("rounded-2xl border p-5", tone.line)}>
                  <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl", tone.fillSoft, tone.accentText)}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h4 className={cn("mt-4 text-base font-semibold", tone.text)}>{pillar.title}</h4>
                  <p className={cn("mt-2 text-sm leading-6", tone.muted)}>{pillar.body}</p>
                </article>
              );
            })}
          </div>
        </div>

        <div className={cn("flex flex-col rounded-2xl border p-5 sm:p-6", tone.line, tone.wash)}>
          <p className={cn("text-xs font-semibold uppercase tracking-[0.14em]", tone.accentText)}>{copy.commitmentsEyebrow}</p>
          <ul className={cn("mt-4 divide-y", tone.divide)}>
            {copy.commitments.map((label, index) => (
              <li key={label}>
                <Link
                  href={COMMITMENT_LINKS[index]}
                  className={cn("flex items-start gap-3 py-3 text-sm leading-6 transition-colors", tone.text, tone.hoverAccentText)}
                >
                  <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", tone.accentText)} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <Link href={ROUTES.public.visionTrust} className="public-action-secondary h-10 !min-h-0 px-4 text-sm">
              {copy.visionTrust}
            </Link>
            <Link href={ROUTES.public.about} className="public-action-secondary h-10 !min-h-0 px-4 text-sm">
              {copy.aboutUs}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
