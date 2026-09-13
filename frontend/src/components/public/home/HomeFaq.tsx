import Link from "next/link";
import { ChevronDown } from "lucide-react";

import type { HomeCopy } from "@/components/public/home/home-copy";
import HomeSectionHeading from "@/components/public/home/HomeSectionHeading";
import { tone } from "@/components/public/ui/tone";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Native <details> accordion: works before hydration and ships no JavaScript. */
export default function HomeFaq({ copy }: { copy: HomeCopy["faq"] }) {
  return (
    <section id="faq" aria-label={copy.eyebrow} className="scroll-mt-24 space-y-6 lg:scroll-mt-64">
      <HomeSectionHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      <div className={cn("divide-y overflow-hidden rounded-2xl border", tone.surface, tone.line, tone.divide)}>
        {copy.items.map((item) => (
          <details key={item.question} className="group/faq px-5 py-4">
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold sm:text-base [&::-webkit-details-marker]:hidden",
                tone.text
              )}
            >
              {item.question}
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform group-open/faq:rotate-180", tone.muted)} aria-hidden="true" />
            </summary>
            <p className={cn("mt-3 text-sm leading-6", tone.muted)}>{item.answer}</p>
          </details>
        ))}
      </div>
      <div className="flex justify-center">
        <Link href={ROUTES.public.faq} className="public-action-secondary text-sm">
          {copy.viewAll}
        </Link>
      </div>
    </section>
  );
}
