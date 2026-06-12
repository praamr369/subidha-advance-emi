import Link from "next/link";
import { ArrowRight, ClipboardCheck, PackageCheck, Undo2, Wallet } from "lucide-react";

import GeneratedMarketingVisual from "@/components/public/GeneratedMarketingVisual";
import PublicSectionShell from "@/components/public/PublicSectionShell";
import SectionHeader from "@/components/public/SectionHeader";
import { ROUTES } from "@/lib/routes";

type RentLeaseMode = "rent" | "lease";

type RentLeaseWorkflowPreviewProps = {
  mode: RentLeaseMode;
};

const modeCopy = {
  rent: {
    eyebrow: "Rent operations",
    title: "Flexible usage with monthly records and return checks",
    description: "Rent stays separate from Lucky Plan EMI. Public pages explain terms; operational collection, deposit handling, inspection, and return closure stay controlled inside the system.",
    visualLabel: "Rent workflow visual",
    closingTitle: "Need help choosing rent?",
    closingDescription: "Use rent when the requirement is short-term or flexible and ownership is not the immediate goal.",
  },
  lease: {
    eyebrow: "Lease operations",
    title: "Longer-term access with contract-backed checkpoints",
    description: "Lease stays separate from Lucky Plan EMI. Public pages explain terms; operational collection, deposit handling, inspection, renewal, and closure stay controlled inside the system.",
    visualLabel: "Lease workflow visual",
    closingTitle: "Need lease planning support?",
    closingDescription: "Use lease when the requirement is longer-term and contract discipline matters more than short-term flexibility.",
  },
} as const;

const steps = [
  {
    icon: PackageCheck,
    title: "Choose eligible item",
    description: "Product discovery can start publicly, but operational allocation remains controlled by staff workflow.",
  },
  {
    icon: ClipboardCheck,
    title: "Approve contract terms",
    description: "Tenure, deposit, usage conditions and return duties must be understood before activation.",
  },
  {
    icon: Wallet,
    title: "Collect monthly dues",
    description: "Monthly collection stays separate from Lucky Plan EMI and does not create draw participation.",
  },
  {
    icon: Undo2,
    title: "Inspect and close",
    description: "Return, damage, refund and closure decisions depend on condition checks and policy rules.",
  },
] as const;

export default function RentLeaseWorkflowPreview({ mode }: RentLeaseWorkflowPreviewProps) {
  const copy = modeCopy[mode];

  return (
    <PublicSectionShell className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
      <div className="space-y-5">
        <SectionHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
        <GeneratedMarketingVisual
          src="/marketing/generated/rent-lease-3d-room.webp"
          alt={`Decorative 3D ${mode} furniture workflow room visual`}
          label={copy.visualLabel}
          className="min-h-[18rem]"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {steps.map((step) => (
          <article key={step.title} className="public-card public-card-animated p-5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface-card-elevated)_87%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
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
