import Link from "next/link";
import { ArrowRight, ClipboardCheck, Search, Truck, Wallet } from "lucide-react";

import type { HomeCopy } from "@/components/public/home/home-copy";
import HomeSectionHeading from "@/components/public/home/HomeSectionHeading";
import { tone } from "@/components/public/ui/tone";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const STEP_ICONS = [Search, ClipboardCheck, Wallet, Truck] as const;

export default function HomeHowItWorks({ copy }: { copy: HomeCopy["howItWorks"] }) {
  return (
    <section
      id="how-it-works"
      aria-label={copy.eyebrow}
      className={cn("scroll-mt-24 rounded-[1.75rem] border p-6 sm:p-8 lg:scroll-mt-64", tone.surface, tone.line)}
    >
      <HomeSectionHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />

      <ol className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {copy.steps.map((step, index) => {
          const Icon = STEP_ICONS[index];
          return (
            <li key={step.title} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold", tone.fill)}>
                  {index + 1}
                </span>
                <Icon className={cn("h-5 w-5 shrink-0", tone.accentText)} aria-hidden="true" />
                {index < copy.steps.length - 1 ? (
                  <span aria-hidden="true" className={cn("hidden h-px flex-1 xl:block", tone.rule)} />
                ) : null}
              </div>
              <h3 className={cn("text-base font-semibold", tone.text)}>{step.title}</h3>
              <p className={cn("text-sm leading-6", tone.muted)}>{step.body}</p>
            </li>
          );
        })}
      </ol>

      <div className={cn("mt-8 flex flex-wrap gap-3 border-t pt-6", tone.line)}>
        <Link href={ROUTES.public.apply} className="public-action-primary gap-2">
          {copy.start}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link href={ROUTES.public.howItWorks} className="public-action-secondary">
          {copy.guide}
        </Link>
        <Link href={ROUTES.public.rulebook} className="public-action-secondary">
          {copy.rulebook}
        </Link>
      </div>
    </section>
  );
}
