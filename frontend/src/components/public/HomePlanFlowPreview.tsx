import Link from "next/link";
import { ArrowRight, ClipboardCheck, PackageCheck, ReceiptText, Wallet } from "lucide-react";

import GeneratedMarketingVisual from "@/components/public/GeneratedMarketingVisual";
import PublicSectionShell from "@/components/public/PublicSectionShell";
import SectionHeader from "@/components/public/SectionHeader";
import { PUBLIC_MARKETING_ASSETS } from "@/lib/public-marketing-assets";
import { ROUTES } from "@/lib/routes";

const steps = [
  {
    icon: PackageCheck,
    title: "Choose furniture or appliance",
    description: "Start from the real public catalogue or branch-assisted selection.",
  },
  {
    icon: ClipboardCheck,
    title: "Select the right plan",
    description: "Advance EMI, rent, lease or direct-sale flow stays clearly separated.",
  },
  {
    icon: Wallet,
    title: "Pay monthly with records",
    description: "Customer-facing payment history and receipts stay inside the authenticated portal.",
  },
  {
    icon: ReceiptText,
    title: "Track proof online",
    description: "Winner publication, documents and product status use controlled system data.",
  },
] as const;

export default function HomePlanFlowPreview() {
  return (
    <PublicSectionShell className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
      <div className="space-y-5">
        <SectionHeader
          eyebrow="How Subidha works"
          title="A modern public site, backed by controlled shop operations"
          description="The homepage can look premium and animated while system records remain authoritative. Public content never creates payments, winners, delivery proof, or stock claims."
        />
        <GeneratedMarketingVisual asset={PUBLIC_MARKETING_ASSETS.receiptContract} className="min-h-[18rem]" />
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
            <h3 className="text-base font-semibold text-foreground">Need plan guidance?</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Start an enquiry or review the Lucky Plan rules first.</p>
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
