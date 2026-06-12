import Link from "next/link";
import { ArrowRight, BadgeCheck, PackageCheck, ReceiptText, ShieldCheck, Sparkles } from "lucide-react";

import GeneratedMarketingVisual from "@/components/public/GeneratedMarketingVisual";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type ProductCatalogueHeroProps = {
  title: string;
  subtitle: string;
  count: number;
  mediaReadyCount: number;
  categoryCount: number;
};

const proofPoints = [
  {
    icon: PackageCheck,
    title: "Live catalogue only",
    description: "Product names, codes and prices come from public product records, not hardcoded cards.",
  },
  {
    icon: ShieldCheck,
    title: "No fake stock promise",
    description: "Stock, delivery, batch seats and eligibility are confirmed only after branch review.",
  },
  {
    icon: ReceiptText,
    title: "Plan handoff ready",
    description: "A selected product can be carried into enquiry without creating a contract automatically.",
  },
] as const;

export default function ProductCatalogueHero({
  title,
  subtitle,
  count,
  mediaReadyCount,
  categoryCount,
}: ProductCatalogueHeroProps) {
  const stats = [
    { label: "Published products", value: count.toLocaleString("en-IN") },
    { label: "Categories", value: categoryCount.toLocaleString("en-IN") },
    { label: "Media-ready", value: mediaReadyCount.toLocaleString("en-IN") },
  ];

  return (
    <section className="public-hero relative overflow-hidden p-5 sm:p-7 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(214,170,94,0.22),transparent_32%),radial-gradient(circle_at_16%_84%,rgba(112,72,42,0.14),transparent_34%)]" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Live public catalogue
          </div>

          <div className="space-y-4">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            <p className="max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
              {subtitle}
            </p>
            <div className="public-card-sm max-w-3xl px-4 py-3 text-sm leading-6 text-muted-foreground">
              <strong className="font-semibold text-foreground">Important:</strong> This catalogue supports discovery and enquiry only. Final stock, delivery, plan type, tenure, EMI, rent, lease, invoice, and receipt posture are confirmed through controlled branch workflows.
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={ROUTES.public.apply} className="public-action-primary gap-2">
              Apply / Enquire
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={ROUTES.public.luckyPlan} className="public-action-secondary">
              Lucky Plan
            </Link>
            <Link href={ROUTES.public.rent} className="public-action-secondary">
              Rent / Lease
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {stats.map((item) => (
              <div key={item.label} className="public-card-sm px-4 py-3">
                <div className="text-2xl font-semibold tracking-tight text-foreground">{item.value}</div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <GeneratedMarketingVisual
            src="/marketing/generated/product-wall-3d.webp"
            alt="Decorative 3D product category wall for furniture, electronics, and appliances"
            label="Product wall visual"
            className="min-h-[22rem] lg:min-h-[30rem]"
          />
          <div className="pointer-events-none absolute -left-3 top-8 hidden rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Furniture + appliances</div>
            <div className="mt-1 text-sm font-semibold text-foreground">Category discovery</div>
          </div>
          <div className="pointer-events-none absolute -right-3 bottom-8 hidden rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Product handoff</div>
            <div className="mt-1 text-sm font-semibold text-foreground">Enquiry-ready context</div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-6 grid gap-3 md:grid-cols-3">
        {proofPoints.map((point, index) => (
          <article
            key={point.title}
            className={cn(
              "public-card-sm public-card-animated px-4 py-4",
              index === 1 && "md:translate-y-3",
              index === 2 && "md:translate-y-1"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_14%,var(--surface-card-elevated)_86%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
                <point.icon className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold text-foreground">{point.title}</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{point.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
