import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, PackageCheck, Undo2, Wallet } from "lucide-react";

import Image from "next/image";
import PublicSectionShell from "@/components/public/PublicSectionShell";
import SectionHeader from "@/components/public/SectionHeader";
import { ROUTES } from "@/lib/routes";

type RentLeaseMode = "rent" | "lease";

type RentLeaseWorkflowPreviewProps = {
  mode: RentLeaseMode;
};

export default async function RentLeaseWorkflowPreview({ mode }: RentLeaseWorkflowPreviewProps) {
  const locale = await getPublicLocale();
  const dict = getPublicDictionary(locale);
    const modeCopy = {
      rent: {
        eyebrow: dict.public.RentLeaseWorkflowPreview_prop1,
        title: dict.public.RentLeaseWorkflowPreview_prop2,
        description: dict.public.RentLeaseWorkflowPreview_prop3,
        closingTitle: "Need help choosing rent?",
        closingDescription: "Use rent when the requirement is short-term or flexible and ownership is not the immediate goal.",
      },
      lease: {
        eyebrow: dict.public.RentLeaseWorkflowPreview_prop4,
        title: dict.public.RentLeaseWorkflowPreview_prop5,
        description: dict.public.RentLeaseWorkflowPreview_prop6,
        closingTitle: "Need lease planning support?",
        closingDescription: "Use lease when the requirement is longer-term and contract discipline matters more than short-term flexibility.",
      },
    } as const;

    const steps = [
      {
        icon: PackageCheck,
        title: dict.public.RentLeaseWorkflowPreview_prop7,
        description: dict.public.RentLeaseWorkflowPreview_prop8,
      },
      {
        icon: ClipboardCheck,
        title: dict.public.RentLeaseWorkflowPreview_prop9,
        description: dict.public.RentLeaseWorkflowPreview_prop10,
      },
      {
        icon: Wallet,
        title: dict.public.RentLeaseWorkflowPreview_prop11,
        description: dict.public.RentLeaseWorkflowPreview_prop12,
      },
      {
        icon: Undo2,
        title: dict.public.RentLeaseWorkflowPreview_prop13,
        description: dict.public.RentLeaseWorkflowPreview_prop14,
      },
    ] as const;

  const copy = modeCopy[mode];

  return (
    <PublicSectionShell className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
      <div className="space-y-5">
        <SectionHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
        <div className="relative w-full overflow-hidden rounded-[1.6rem] shadow-[0_24px_54px_-24px_rgba(15,23,42,0.6)]">
          <Image
            src="/images/banner_rent.jpg"
            alt={dict.public.RentLeaseWorkflowPreview_attr15}
            width={800}
            height={533}
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
            <h3 className="text-base font-semibold text-foreground">{copy.closingTitle}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.closingDescription}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.public.products} className="public-action-secondary">
              Products
            </Link>
            <Link href={ROUTES.public.apply} className="public-action-primary gap-2">
              Enquire
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </PublicSectionShell>
  );
}
