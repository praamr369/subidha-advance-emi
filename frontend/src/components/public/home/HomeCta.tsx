import Link from "next/link";

import type { HomeCopy } from "@/components/public/home/home-copy";
import { tone } from "@/components/public/ui/tone";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type HomeCtaProps = {
  copy: HomeCopy["cta"];
  productsLabel: string;
  applyLabel: string;
};

const OUTLINE_ON_FILL =
  "inline-flex h-11 items-center rounded-xl border border-white/35 px-5 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

export default function HomeCta({ copy, productsLabel, applyLabel }: HomeCtaProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-6 rounded-[1.75rem] p-7 sm:p-10 lg:flex-row lg:items-center lg:justify-between",
        tone.fill
      )}
    >
      <div className="max-w-2xl">
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h2>
        <p className={cn("mt-2 text-sm leading-6 sm:text-base", tone.onFillMuted)}>{copy.description}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href={ROUTES.public.products} className={OUTLINE_ON_FILL}>
          {productsLabel}
        </Link>
        <Link href={ROUTES.public.contact} className={OUTLINE_ON_FILL}>
          {copy.visitShowroom}
        </Link>
        <Link
          href={ROUTES.public.apply}
          className={cn(
            "inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            tone.invertFill
          )}
        >
          {applyLabel}
        </Link>
      </div>
    </section>
  );
}
