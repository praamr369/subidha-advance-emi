import Link from "next/link";
import { ArrowRight, BadgeCheck, ShieldCheck, Sparkles, Wallet } from "lucide-react";

import GeneratedMarketingVisual from "@/components/public/GeneratedMarketingVisual";
import PublicSectionShell from "@/components/public/PublicSectionShell";
import SectionHeader from "@/components/public/SectionHeader";
import { PUBLIC_MARKETING_ASSETS } from "@/lib/public-marketing-assets";
import { ROUTES } from "@/lib/routes";

const mechanics = [
  {
    icon: BadgeCheck,
    title: "Batch and Lucky ID",
    description: "A customer joins an approved batch and receives a controlled Lucky ID. Public UI does not assign IDs.",
  },
  {
    icon: Wallet,
    title: "Monthly EMI record",
    description: "Payment collection, receipt status, and customer ledger remain handled by authenticated workflows.",
  },
  {
    icon: Sparkles,
    title: "Winner publication",
    description: "Published winners come from revealed draw records. Public pages do not calculate or alter winners.",
  },
  {
    icon: ShieldCheck,
    title: "Waiver boundary",
    description: "Winner waiver applies only to future EMI obligations and does not reverse paid EMI history.",
  },
] as const;

export default function LuckyPlanMechanicsPreview() {
  return (
    <PublicSectionShell className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
      <div className="space-y-5">
        <SectionHeader
          eyebrow="Plan mechanics"
          title="A simple public explanation for a controlled financial workflow"
          description="Customers can understand the Lucky Plan visually, while actual contracts, payments, draw reveal, waiver posting, and audit evidence stay inside the production system."
        />
        <GeneratedMarketingVisual asset={PUBLIC_MARKETING_ASSETS.winnerDraw} className="min-h-[18rem]" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {mechanics.map((item) => (
          <article key={item.title} className="public-card public-card-animated p-5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface-card-elevated)_87%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
              <item.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
          </article>
        ))}
        <div className="public-card-sm flex flex-col justify-between gap-4 p-5 sm:col-span-2 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-semibold text-foreground">Review before enrollment</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Read the fair draw page and policy section before applying.</p>
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
