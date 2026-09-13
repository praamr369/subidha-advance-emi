import Link from "next/link";
import { Check, Handshake, Home, ShoppingBag, Sparkles, type LucideIcon } from "lucide-react";

import type { HomeCopy, PlanKey } from "@/components/public/home/home-copy";
import HomeSectionHeading from "@/components/public/home/HomeSectionHeading";
import { tone } from "@/components/public/ui/tone";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const PLANS: ReadonlyArray<{ key: PlanKey; icon: LucideIcon; href: string; featured?: boolean }> = [
  { key: "luckyPlan", icon: Sparkles, href: ROUTES.public.luckyPlan, featured: true },
  { key: "rent", icon: Home, href: ROUTES.public.rent },
  { key: "lease", icon: Handshake, href: ROUTES.public.lease },
  { key: "directSale", icon: ShoppingBag, href: ROUTES.public.directSale },
];

export default function HomePlans({ copy }: { copy: HomeCopy["plans"] }) {
  return (
    <section id="plans" aria-label={copy.eyebrow} className="scroll-mt-24 space-y-6 lg:scroll-mt-64">
      <HomeSectionHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const text = copy.items[plan.key];
          return (
            <article
              key={plan.key}
              className={cn(
                "flex flex-col rounded-2xl border p-5",
                tone.surface,
                plan.featured ? cn(tone.accentLine, tone.accentRing) : tone.line
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={cn(
                    "inline-flex h-11 w-11 items-center justify-center rounded-xl",
                    plan.featured ? tone.fill : cn(tone.fillSoft, tone.accentText)
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {plan.featured ? (
                  <span
                    className={cn(
                      "rounded-full bg-[color:color-mix(in_oklab,var(--accent)_28%,transparent)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]",
                      tone.text
                    )}
                  >
                    {copy.signature}
                  </span>
                ) : null}
              </div>

              <h3 className={cn("mt-4 text-lg font-semibold", tone.text)}>{text.name}</h3>
              <p className={cn("mt-2 text-sm leading-6", tone.muted)}>{text.pitch}</p>

              <ul className="mt-4 space-y-2.5">
                {text.points.map((point) => (
                  <li key={point} className={cn("flex gap-2.5 text-sm leading-6", tone.textSoft)}>
                    <Check className={cn("mt-1 h-4 w-4 shrink-0", tone.accentText)} aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>

              <p className={cn("mt-4 rounded-xl px-3 py-2 text-xs leading-5", tone.wash, tone.muted)}>
                <span className={cn("font-semibold", tone.text)}>{copy.bestFor}</span>
                {text.bestFor}
              </p>
              {text.note ? <p className={cn("mt-2 text-xs leading-5", tone.muted)}>{text.note}</p> : null}

              <div className="mt-auto flex gap-2 pt-5">
                <Link href={plan.href} className="public-action-secondary h-10 !min-h-0 flex-1 px-3 text-sm">
                  {copy.details}
                </Link>
                <Link href={ROUTES.public.apply} className="public-action-primary h-10 !min-h-0 flex-1 px-3 text-sm">
                  {copy.enquire}
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <div className={cn("overflow-x-auto rounded-2xl border", tone.surface, tone.line)}>
        {/* Inline minWidth: the marketing shell forces min-width:0 on descendants. */}
        <table className="w-full border-collapse text-left text-sm" style={{ minWidth: "44rem" }}>
          <caption className="px-5 pt-5 text-left">
            <span className={cn("block text-base font-semibold", tone.text)}>{copy.table.title}</span>
            <span className={cn("mt-1 block text-sm font-normal", tone.muted)}>{copy.table.note}</span>
          </caption>
          <thead>
            <tr className={cn("border-b", tone.line)}>
              <th scope="col" className="px-5 py-3">
                <span className="sr-only">{copy.table.feature}</span>
              </th>
              {copy.table.columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cn("px-4 py-3 font-semibold", tone.text, index === 0 && tone.fillTint)}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {copy.table.rows.map((row) => (
              <tr key={row.label} className={cn("border-b last:border-0", tone.line)}>
                <th scope="row" className={cn("px-5 py-3 font-medium", tone.muted)}>
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td key={copy.table.columns[index]} className={cn("px-4 py-3", tone.text, index === 0 && tone.fillTint)}>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
