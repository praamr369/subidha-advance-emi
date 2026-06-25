import Link from "next/link";
import { ArrowRight, Boxes, Image as ImageIcon, PackageCheck } from "lucide-react";

import GeneratedMarketingVisual from "@/components/public/GeneratedMarketingVisual";
import PublicSectionShell from "@/components/public/PublicSectionShell";
import SectionHeader from "@/components/public/SectionHeader";
import { PUBLIC_MARKETING_ASSETS } from "@/lib/public-marketing-assets";
import { ROUTES } from "@/lib/routes";

export type ProductCategorySummary = {
  name: string;
  count: number;
  mediaReadyCount: number;
  samples: string[];
};

type ProductCategoryDiscoveryProps = {
  categories: ProductCategorySummary[];
};

export default function ProductCategoryDiscovery({ categories }: ProductCategoryDiscoveryProps) {
  return (
    <PublicSectionShell className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
      <div className="space-y-5">
        <SectionHeader
          eyebrow="Category discovery"
          title="Browse by real published category"
          description="These category cards are derived from live public product records. They are discovery aids only; they do not imply stock reservation, delivery readiness, or plan approval."
        />
        <GeneratedMarketingVisual asset={PUBLIC_MARKETING_ASSETS.productWall} className="min-h-[18rem]" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {categories.length > 0 ? (
          categories.slice(0, 8).map((category) => (
            <article key={category.name} className="public-card public-card-animated p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface-card-elevated)_87%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
                  <Boxes className="h-5 w-5" />
                </span>
                <span className="rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_82%,transparent)] px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {category.count.toLocaleString("en-IN")} items
                </span>
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">{category.name}</h3>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  {category.mediaReadyCount.toLocaleString("en-IN")} media-ready
                </div>
                <div className="flex items-start gap-2">
                  <PackageCheck className="mt-1 h-4 w-4 text-primary" />
                  <span>{category.samples.length > 0 ? category.samples.join(", ") : "Catalogue samples pending"}</span>
                </div>
              </div>
            </article>
          ))
        ) : (
          <article className="public-card-sm p-5 sm:col-span-2">
            <h3 className="text-base font-semibold text-foreground">No categories published yet</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The public catalogue has no category metadata available. Published products will still appear in the live catalogue when available.
            </p>
          </article>
        )}

        <div className="public-card-sm flex flex-col justify-between gap-4 p-5 sm:col-span-2 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-semibold text-foreground">Need assisted selection?</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Send an enquiry and the branch can confirm item fit, plan type, and document requirements.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.public.contact} className="public-action-secondary">
              Contact
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
