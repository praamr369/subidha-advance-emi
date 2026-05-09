import type { Metadata } from "next";
import Link from "next/link";

import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { ROUTES } from "@/lib/routes";
import { listPublicProducts, type PublicProduct } from "@/lib/public-api";
import { buildPublicMetadata } from "@/lib/public-seo";
import ProductGrid from "./ProductGrid";

export const metadata: Metadata = buildPublicMetadata({
  title: "Products",
  description: "Browse furniture, electronics, and appliances from the live public catalogue.",
  path: "/products",
});

export default async function ProductsPage() {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);

  let products: PublicProduct[] = [];
  let count = 0;
  let error: string | null = null;

  try {
    const payload = await listPublicProducts();
    products = payload.products;
    count = payload.count;
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to load products right now.";
  }

  const mediaReadyCount = products.filter((product) => Boolean(product.image)).length;

  return (
    <PublicPageShell
      title={dictionary.common.products}
      subtitle="Browse the live catalogue and enquire with your preferred product in one flow."
      breadcrumbs={[
        { label: dictionary.common.home, href: ROUTES.public.home },
        { label: dictionary.common.products },
      ]}
      actions={[
        { label: dictionary.common.luckyPlan, href: ROUTES.public.luckyPlan, variant: "secondary" },
        { label: dictionary.common.apply, href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <PublicMarketingBanner
        eyebrow="Category bands"
        title="Browse realistic home categories"
        description="Find sofas, beds, wardrobes, dining sets, refrigerators, washing machines, TVs, and kitchen appliances."
        items={[
          { title: "Furniture essentials", description: "Sofas, beds, wardrobes, and dining sets." },
          { title: "Electronics", description: "TV and household electronics for daily needs." },
          { title: "Home appliances", description: "Refrigerator, washing machine, and kitchen appliances." },
        ]}
      />

      <PublicMarketingBanner
        eyebrow="Purchase confidence"
        title="Warranty, return policy, and payment safety"
        description="Final terms depend on product and contract type, but policy support and document visibility are available for every customer."
        items={[
          { title: "Warranty visibility", description: "Warranty/coverage terms are confirmed at contract and document stage." },
          { title: "Return support flow", description: "Return/issue handling is routed through customer support with status tracking." },
          { title: "Receipt traceability", description: "Receipts and contract documents are available in customer self-service." },
        ]}
      />

      <section className="rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <p className="mb-4 text-sm leading-6 text-muted-foreground">
          Browse the live catalogue sourced from production product records.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[1.5rem] border border-white/80 bg-white/82 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Published products</div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{count}</div>
          </div>
          <div className="rounded-[1.5rem] border border-white/80 bg-white/82 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Media-ready cards</div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{mediaReadyCount}</div>
          </div>
          <div className="rounded-[1.5rem] border border-white/80 bg-white/82 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Workflow</div>
            <div className="mt-2 text-lg font-semibold text-foreground">Browse → Inspect → Enquire</div>
          </div>
        </div>

        {error ? <div className="mt-6 rounded-[1.6rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : <div className="mt-6"><ProductGrid products={products} locale={locale} /></div>}
      </section>

      <section className="public-surface p-6">
        <p className="text-sm leading-7 text-muted-foreground">
          Listed amounts come from the same product records shown here. Stock, batch seats, tenure, and monthly EMI are confirmed only after branch review—not from this page alone.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={ROUTES.public.apply} className="public-action-primary h-10 !min-h-0">
            {dictionary.common.apply}
          </Link>
          <Link href={ROUTES.public.contact} className="public-action-secondary h-10 !min-h-0">
            {dictionary.common.contact}
          </Link>
        </div>
      </section>
    </PublicPageShell>
  );
}
