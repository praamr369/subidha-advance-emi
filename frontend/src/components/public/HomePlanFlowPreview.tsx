import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, PackageCheck, ReceiptText, Wallet } from "lucide-react";

import Image from "next/image";
import PublicSectionShell from "@/components/public/PublicSectionShell";
import SectionHeader from "@/components/public/SectionHeader";
import { ROUTES } from "@/lib/routes";



export default async function HomePlanFlowPreview() {
  const locale = await getPublicLocale();
  const dict = getPublicDictionary(locale);

const steps = [
  {
    icon: PackageCheck,
    title: dict.public.HomePlanFlowPreview_prop1,
    description: dict.public.HomePlanFlowPreview_prop2,
  },
  {
    icon: ClipboardCheck,
    title: dict.public.HomePlanFlowPreview_prop3,
    description: dict.public.HomePlanFlowPreview_prop4,
  },
  {
    icon: Wallet,
    title: dict.public.HomePlanFlowPreview_prop5,
    description: dict.public.HomePlanFlowPreview_prop6,
  },
  {
    icon: ReceiptText,
    title: dict.public.HomePlanFlowPreview_prop7,
    description: dict.public.HomePlanFlowPreview_prop8,
  },
] as const;

  return (
    <PublicSectionShell className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
      <div className="space-y-5">
        <SectionHeader
          eyebrow={dict.public.HomePlanFlowPreview_attr9}
          title={dict.public.HomePlanFlowPreview_attr10}
          description={dict.public.HomePlanFlowPreview_attr11}
        />
        <div className="relative w-full overflow-hidden rounded-[1.6rem] shadow-[0_24px_54px_-24px_rgba(15,23,42,0.6)]">
          <Image
            src="/images/banner_policies.jpg"
            alt={dict.public.HomePlanFlowPreview_attr12}
            width={800}
            height={533}
            priority
            className="w-full object-cover min-h-[18rem]"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {steps.map((step) => (
          <article key={step.title} className="public-card public-card-animated p-5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface-card-elevated)_87%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
              <step.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
          </article>
        ))}
        <div className="public-card-sm flex flex-col justify-between gap-4 p-5 sm:col-span-2 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-semibold text-foreground">{dict.public.HomePlanFlowPreview_text13}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{dict.public.HomePlanFlowPreview_text14}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.public.apply} className="public-action-primary gap-2">
              Start enquiry
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={ROUTES.public.luckyPlan} className="public-action-secondary">
              Lucky Plan rules
            </Link>
          </div>
        </div>
      </div>
    </PublicSectionShell>
  );
}
