import type { Metadata } from "next";
import Link from "next/link";

import ProductCatalogueHero from "@/components/public/ProductCatalogueHero";
import ProductCategoryDiscovery, { type ProductCategorySummary } from "@/components/public/ProductCategoryDiscovery";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import PublicSeoJsonLd from "@/components/public/PublicSeoJsonLd";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { PRODUCT_SEO_CATEGORIES } from "@/lib/product-category-seo";
import { ROUTES } from "@/lib/routes";
import { listPublicProducts, listPublicProductCategories, type PublicProduct } from "@/services/public";
import { buildFaqJsonLd, buildItemListJsonLd, buildPublicMetadata } from "@/lib/public-seo";
import ProductGrid from "./ProductGrid";

export const metadata: Metadata = buildPublicMetadata({
  title: "Furniture Products in Asansol",
  description: "Browse beds, sofas, wardrobes, dining tables, mattresses and appliances at Subidha Furniture, Asansol. EMI and Lucky Plan options as per approved terms.",
  path: "/products",
});

const PRODUCTS_FAQS = [
  {
    question: "What furniture can I buy in Asansol from Subidha Furniture?",
    answer: "Beds, sofas, wardrobes, dining tables, mattresses and selected home appliances. Models and availability change, so visit our showroom for the current range.",
  },
  {
    question: "Can I buy furniture on EMI in Asansol?",
    answer: "EMI and Lucky Plan EMI options may be available as per approved terms. Contact us or visit the showroom to understand the plans and eligibility.",
  },
  {
    question: "Do the listed products confirm stock or price?",
    answer: "The public catalogue helps you browse. Final stock, pricing, plan type, and documents are confirmed by the branch, not from this page alone.",
  },
];

function buildCategorySummaries(products: PublicProduct[]): ProductCategorySummary[] {
  const map = new Map<string, { count: number; mediaReadyCount: number; samples: string[] }>();

  for (const product of products) {
    const name = product.category?.trim() || "Unclassified";
    const current = map.get(name) ?? { count: 0, mediaReadyCount: 0, samples: [] };
    current.count += 1;
    if (product.image) current.mediaReadyCount += 1;
    if (current.samples.length < 3) current.samples.push(product.name);
    map.set(name, current);
  }

  return Array.from(map.entries())
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);
  
  const resolvedSearchParams = (await searchParams) || {};
  const initialSearch = resolvedSearchParams.search || "";

  let products: PublicProduct[] = [];
  let count = 0;
  let nextUrl: string | null = null;
  let error: string | null = null;
  let serverCategories: import("@/services/public").PublicProductCategory[] = [];

  try {
    const [payload, categories] = await Promise.all([
      listPublicProducts({ limit: 24, search: initialSearch }),
      listPublicProductCategories(),
    ]);
    products = payload.products;
    count = payload.count;
    nextUrl = payload.next || null;
    serverCategories = categories;
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to load products right now.";
  }

  const mediaReadyCount = products.filter((product) => Boolean(product.image)).length;
  const categorySummaries = buildCategorySummaries(products);

  return (
    <PublicPageShell
      title={dictionary.common.products}
      subtitle="Browse the live catalogue and enquire with your preferred product in one flow."
      heroSlot={
        <ProductCatalogueHero
          title={dictionary.common.products}
          subtitle="Browse the live catalogue and enquire with your preferred product in one controlled flow. Public product pages help selection only; final stock, plan type, documents, and financial records are confirmed by the branch."
          count={count}
          mediaReadyCount={mediaReadyCount}
          categoryCount={categorySummaries.length}
        />
      }
      breadcrumbs={[
        { label: dictionary.common.home, href: ROUTES.public.home },
        { label: dictionary.common.products },
      ]}
      actions={[
        { label: dictionary.common.luckyPlan, href: ROUTES.public.luckyPlan, variant: "secondary" },
        { label: dictionary.common.apply, href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <PublicSeoJsonLd
        payload={buildItemListJsonLd(
          PRODUCT_SEO_CATEGORIES.map((category) => ({ name: `${category.name} in Asansol`, path: `/products/${category.slug}` }))
        )}
      />
      <PublicSeoJsonLd payload={buildFaqJsonLd(PRODUCTS_FAQS)} />

      <ProductCategoryDiscovery categories={categorySummaries} />

      {/* Primary Shopping Section - Quick Commerce Style */}
      <section className="mt-2 mb-8">
        {error ? (
          <div className="rounded-[1.6rem] border border-red-200/90 bg-[linear-gradient(180deg,rgba(254,242,242,0.98),rgba(254,226,226,0.9))] px-5 py-4 text-sm text-red-700 shadow-[0_16px_36px_-28px_rgba(127,29,29,0.42)]">
            {error}
          </div>
        ) : (
          <ProductGrid 
            initialProducts={products} 
            initialCount={count}
            initialNext={nextUrl}
            serverCategories={serverCategories}
            initialSearch={initialSearch}
            locale={locale} 
          />
        )}
      </section>

      {/* SEO & Marketing Fluff Moved Below the Fold */}
      <section className="public-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Shop furniture by category in Asansol</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Explore our main furniture categories. Visit the showroom for current designs, availability, and EMI or Lucky Plan options.
        </p>
        <ul className="mt-4 flex flex-wrap gap-3">
          {PRODUCT_SEO_CATEGORIES.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/products/${category.slug}`}
                className="inline-flex rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                {category.name} in Asansol
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <PublicMarketingBanner
        eyebrow="Category bands"
        title="Browse realistic home categories"
        description="Find sofas, beds, wardrobes, dining sets, refrigerators, washing machines, TVs, and kitchen appliances from the published catalogue. Category cards are derived from live product records only."
        items={[
          { title: "Furniture essentials", description: "Sofas, beds, wardrobes, and dining sets." },
          { title: "Electronics", description: "TV and household electronics for daily needs." },
          { title: "Home appliances", description: "Refrigerator, washing machine, and kitchen appliances." },
        ]}
      />

      <PublicMarketingBanner
        eyebrow="Purchase confidence"
        title="Warranty, return policy, and payment safety"
        description="Final terms depend on product and contract type, but policy support and document visibility are available for every customer. This public catalogue does not reserve stock or create a financial transaction."
        items={[
          { title: "Warranty visibility", description: "Warranty/coverage terms are confirmed at contract and document stage." },
          { title: "Return support flow", description: "Return/issue handling is routed through customer support with status tracking." },
          { title: "Receipt traceability", description: "Receipts and contract documents are available in customer self-service." },
        ]}
      />

      <section className="public-surface p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="public-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Published products</div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{count.toLocaleString("en-IN")}</div>
          </div>
          <div className="public-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Media-ready cards</div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{mediaReadyCount.toLocaleString("en-IN")}</div>
          </div>
          <div className="public-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workflow</div>
            <div className="mt-2 text-lg font-semibold text-foreground">Browse → Inspect → Enquire</div>
          </div>
        </div>
      </section>

      <section className="public-surface p-6">
        <p className="text-sm leading-7 text-muted-foreground">
          Listed amounts come from the same product records shown here. Stock, batch seats, tenure, monthly EMI, rent, lease, and direct-sale terms are confirmed only after branch review—not from this page alone.
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
