import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import Link from "next/link";
import { ArrowRight, BadgeCheck, ShieldCheck, Sparkles, Wallet } from "lucide-react";

import Image from "next/image";
import PublicSectionShell from "@/components/public/PublicSectionShell";
import SectionHeader from "@/components/public/SectionHeader";
import { ROUTES } from "@/lib/routes";



export default async function LuckyPlanMechanicsPreview() {
  const locale = await getPublicLocale();
  const dict = getPublicDictionary(locale);

const mechanics = [
  {
    icon: BadgeCheck,
    title: dict.public.LuckyPlanMechanicsPreview_prop1,
    description: dict.public.LuckyPlanMechanicsPreview_prop2,
  },
  {
    icon: Wallet,
    title: dict.public.LuckyPlanMechanicsPreview_prop3,
    description: dict.public.LuckyPlanMechanicsPreview_prop4,
  },
  {
    icon: Sparkles,
    title: dict.public.LuckyPlanMechanicsPreview_prop5,
    description: dict.public.LuckyPlanMechanicsPreview_prop6,
  },
  {
    icon: ShieldCheck,
    title: dict.public.LuckyPlanMechanicsPreview_prop7,
    description: dict.public.LuckyPlanMechanicsPreview_prop8,
  },
] as const;

  return (
    <PublicSectionShell className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
      <div className="space-y-5">
        <SectionHeader
          eyebrow={dict.public.LuckyPlanMechanicsPreview_attr9}
          title={dict.public.LuckyPlanMechanicsPreview_attr10}
          description={dict.public.LuckyPlanMechanicsPreview_attr11}
        />
        <div className="relative w-full overflow-hidden rounded-[1.6rem] shadow-[0_24px_54px_-24px_rgba(15,23,42,0.6)]">
          <Image
            src="/images/banner_draw.jpg"
            alt={dict.public.LuckyPlanMechanicsPreview_attr12}
            width={800}
            height={533}
            className="w-full object-cover min-h-[18rem]"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {mechanics.map((item) => (
          <article key={item.title} className="public-card public-card-animated p-5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface-card-elevated)_87%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
              <item.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
          </article>
        ))}
        <div className="public-card-sm flex flex-col justify-between gap-4 p-5 sm:col-span-2 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-semibold text-foreground">{dict.public.LuckyPlanMechanicsPreview_text13}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{dict.public.LuckyPlanMechanicsPreview_text14}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.public.fairDraw} className="public-action-secondary">
              Fair draw
            </Link>
            <Link href={ROUTES.public.apply} className="public-action-primary gap-2">
              Apply
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </PublicSectionShell>
  );
}
