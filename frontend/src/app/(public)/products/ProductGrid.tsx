"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Search, SlidersHorizontal, Sparkles, X, Loader2 } from "lucide-react";

import PublicProductMedia from "@/components/public/PublicProductMedia";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import ProductCard3D from "@/components/public/ui/ProductCard3D";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { listPublicProducts, type PublicProduct, type PublicProductCategory } from "@/services/public";

type PriceRange = {
  min: number;
  max: number;
};

const DEFAULT_PRICE_RANGE: PriceRange = {
  min: 0,
  max: Infinity,
};

type ProductGridProps = {
  initialProducts: PublicProduct[];
  initialCount: number;
  initialNext: string | null;
  serverCategories: PublicProductCategory[];
  locale?: "en" | "hi" | "bn";
  initialSearch?: string;
};

export default function ProductGrid({
  initialProducts,
  initialCount,
  initialNext,
  serverCategories,
  locale = "en",
  initialSearch = "",
}: ProductGridProps) {
  const labels = locale === "hi" ? {
    hideFilters: "फ़िल्टर छिपाएँ", showFilters: "फ़िल्टर दिखाएँ", filters: "कैटलॉग फ़िल्टर", narrow: "लाइव कैटलॉग को फ़िल्टर करें", reset: "फ़िल्टर रीसेट करें", search: "खोज", searchPlaceholder: "नाम, कोड, या विवरण", category: "श्रेणी", allCategories: "सभी श्रेणियाँ", subcategory: "उप-श्रेणी", allSubcategories: "सभी उप-श्रेणियाँ", priceBand: "कीमत सीमा", min: "न्यूनतम", max: "अधिकतम", results: "लाइव परिणाम", showing: "दिखा रहा है", of: "में से", published: "प्रकाशित उत्पाद", liveView: "लाइव कैटलॉग", any: "कोई भी", loadMore: "और दिखाएं", loading: "लोड हो रहा है..."
  } : locale === "bn" ? {
    hideFilters: "ফিল্টার লুকান", showFilters: "ফিল্টার দেখুন", filters: "ক্যাটালগ ফিল্টার", narrow: "লাইভ ক্যাটালগ ছাঁকুন", reset: "ফিল্টার রিসেট", search: "সার্চ", searchPlaceholder: "নাম, কোড, বা বিবরণ", category: "ক্যাটাগরি", allCategories: "সব ক্যাটাগরি", subcategory: "সাব-ক্যাটাগরি", allSubcategories: "সব সাব-ক্যাটাগরি", priceBand: "দামের সীমা", min: "ন্যূনতম", max: "সর্বোচ্চ", results: "লাইভ ফলাফল", showing: "দেখানো হচ্ছে", of: "মোট", published: "প্রকাশিত পণ্য", liveView: "লাইভ ক্যাটালগ", any: "যেকোনো", loadMore: "আরও দেখুন", loading: "লোড হচ্ছে..."
  } : {
    hideFilters: "Hide filters", showFilters: "Show filters", filters: "Catalogue Filters", narrow: "Narrow the live furniture catalogue", reset: "Reset filters", search: "Search", searchPlaceholder: "Name, code, or description", category: "Category", allCategories: "All categories", subcategory: "Subcategory", allSubcategories: "All subcategories", priceBand: "Price band", min: "Min", max: "Max", results: "Live results", showing: "Showing", of: "of", published: "published products", liveView: "Live catalogue view", any: "Any", loadMore: "Load More", loading: "Loading..."
  };

  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [priceRange, setPriceRange] = useState<PriceRange>(DEFAULT_PRICE_RANGE);
  const [showFilters, setShowFilters] = useState(false);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredPriceRange = useDeferredValue(priceRange);

  const [products, setProducts] = useState<PublicProduct[]>(initialProducts);
  const [totalCount, setTotalCount] = useState<number>(initialCount);
  const [nextPageUrl, setNextPageUrl] = useState<string | null>(initialNext);
  const [currentPage, setCurrentPage] = useState(1);
  const [isFetching, setIsFetching] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedCategory.length > 0 ||
    selectedSubcategory.length > 0 ||
    priceRange.min > 0 ||
    priceRange.max !== Infinity;

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedCategory("");
    setSelectedSubcategory("");
    setPriceRange(DEFAULT_PRICE_RANGE);
  };

  // Fetch when filters change
  useEffect(() => {
    let isMounted = true;
    
    // We don't fetch if it's the exact initial load without any changes 
    // to avoid duplicating the initial render fetch
    if (!hasActiveFilters && currentPage === 1 && initialProducts.length > 0) {
      if (initialSearch === searchQuery) return;
    }

    const fetchFiltered = async () => {
      setIsFetching(true);
      try {
        const payload = await listPublicProducts({
          page: 1,
          limit: 24,
          search: deferredSearchQuery,
          category: selectedCategory,
          subcategory: selectedSubcategory,
          min_price: deferredPriceRange.min > 0 ? deferredPriceRange.min : undefined,
          max_price: deferredPriceRange.max !== Infinity ? deferredPriceRange.max : undefined,
        });

        if (isMounted) {
          setProducts(payload.products);
          setTotalCount(payload.count);
          setNextPageUrl(payload.next || null);
          setCurrentPage(1);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setIsFetching(false);
      }
    };

    fetchFiltered();

    return () => { isMounted = false; };
  }, [deferredSearchQuery, selectedCategory, selectedSubcategory, deferredPriceRange, initialProducts.length, initialSearch]); // Excluded hasActiveFilters and currentPage to prevent loops

  const loadMore = async () => {
    if (!nextPageUrl || isFetchingMore) return;
    
    setIsFetchingMore(true);
    const nextPage = currentPage + 1;
    try {
      const payload = await listPublicProducts({
        page: nextPage,
        limit: 24,
        search: deferredSearchQuery,
        category: selectedCategory,
        subcategory: selectedSubcategory,
        min_price: priceRange.min > 0 ? priceRange.min : undefined,
        max_price: priceRange.max !== Infinity ? priceRange.max : undefined,
      });

      setProducts((prev) => [...prev, ...payload.products]);
      setNextPageUrl(payload.next || null);
      setCurrentPage(nextPage);
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingMore(false);
    }
  };

  if (initialCount === 0 && !hasActiveFilters && !isFetching) {
    return <CatalogEmptyState />;
  }

  return (
    <div className="space-y-6">
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setShowFilters((current) => !current)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-[0_22px_48px_-36px_rgba(15,23,42,0.76)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {showFilters ? labels.hideFilters : labels.showFilters}
        </button>
      </div>

      <section
        className={cn(
          "rounded-[2rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.5),rgba(15,23,42,0.8))] p-5 shadow-[0_28px_72px_-54px_rgba(15,23,42,0.76)] dark:shadow-none",
          showFilters ? "block" : "hidden md:block"
        )}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {labels.filters}
              </div>
              <h2 className="mt-1 text-xl font-semibold text-foreground">
                {labels.narrow}
              </h2>
            </div>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-[0_18px_36px_-28px_rgba(15,23,42,0.72)] transition hover:-translate-y-0.5 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 focus-visible:ring-offset-2"
              >
                <X className="h-4 w-4" />
                {labels.reset}
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.8fr))]">
            <FieldShell label={labels.search}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={labels.searchPlaceholder}
                  className="public-control-focus h-12 w-full rounded-2xl border border-border bg-muted pl-10 pr-4 text-sm text-foreground"
                />
              </div>
            </FieldShell>

            <FieldShell label={labels.category}>
              <select
                value={selectedCategory || ""}
                onChange={(event) => {
                  setSelectedCategory(event.target.value || "");
                  setSelectedSubcategory("");
                }}
                className="public-control-focus h-12 w-full rounded-2xl border border-border bg-muted dark:bg-slate-900 px-3 text-sm text-foreground"
              >
                <option value="" className="dark:bg-slate-900">{labels.allCategories}</option>
                {serverCategories.map((category) => (
                  <option key={category.id} value={category.name} className="dark:bg-slate-900">
                    {category.name}
                  </option>
                ))}
              </select>
            </FieldShell>

            <FieldShell label={labels.subcategory}>
              <input
                type="text"
                value={selectedSubcategory}
                onChange={(event) => setSelectedSubcategory(event.target.value)}
                placeholder="E.g. Bed, Mattress"
                className="public-control-focus h-12 w-full rounded-2xl border border-border bg-muted px-3 text-sm text-foreground"
              />
            </FieldShell>

            <FieldShell label={labels.priceBand}>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={priceRange.min === 0 ? "" : priceRange.min}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setPriceRange((current) => ({
                      ...current,
                      min: Number.isFinite(value) ? value : 0,
                    }));
                  }}
                  placeholder={labels.min}
                  className="public-control-focus h-12 rounded-2xl border border-border bg-muted px-3 text-sm text-foreground"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={priceRange.max === Infinity ? "" : priceRange.max}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setPriceRange((current) => ({
                      ...current,
                      max: Number.isFinite(value) ? value : Infinity,
                    }));
                  }}
                  placeholder={labels.max}
                  className="public-control-focus h-12 rounded-2xl border border-border bg-muted px-3 text-sm text-foreground"
                />
              </div>
            </FieldShell>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-[1.9rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.5),rgba(15,23,42,0.8))] px-5 py-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.72)] dark:shadow-none sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
            {labels.results}
            {isFetching && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {labels.showing} {products.length} {labels.of} {totalCount} {labels.published}.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {selectedCategory ? <FilterChip label={selectedCategory} /> : null}
          {selectedSubcategory ? <FilterChip label={selectedSubcategory} /> : null}
          {priceRange.min > 0 || priceRange.max !== Infinity ? (
            <FilterChip
              label={`₹${priceRange.min || 0} - ${
                priceRange.max === Infinity ? labels.any : `₹${priceRange.max}`
              }`}
            />
          ) : null}
          {!hasActiveFilters ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 dark:border-emerald-900 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" />
              {labels.liveView}
            </div>
          ) : null}
        </div>
      </section>

      {products.length === 0 && !isFetching ? (
        <FilteredEmptyState onReset={resetFilters} />
      ) : (
        <div className={cn(
          "grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 lg:gap-8 transition-opacity duration-300",
          isFetching ? "opacity-50" : "opacity-100"
        )}>
          {products.map((product) => {
            // Prefer server-computed scheme pricing (live offer discounts and
            // real configured tenures) and fall back to the raw base price only
            // when the pricing block is unavailable.
            const pricing = product.scheme_pricing;
            const basePrice = Number(product.base_price) || 0;
            const price = Number(pricing?.cash_price ?? product.base_price) || 0;
            const originalPrice = pricing?.cash_has_discount
              ? Number(pricing.cash_base_price ?? product.base_price) || 0
              : null;
            const monthly = pricing?.lowest_monthly != null ? Number(pricing.lowest_monthly) : null;
            return (
              <ProductCard3D
                key={product.id}
                id={String(product.id)}
                title={product.seo_name || product.name}
                category={product.category || "Uncategorized"}
                subcategory={product.subcategory}
                price={price || basePrice}
                emiAmount={monthly != null ? Math.round(monthly) : 0}
                hideMonthly={monthly == null}
                originalPrice={originalPrice}
                imageUrl={product.image || ""}
                href={`/products/${product.product_code}`}
              />
            );
          })}
        </div>
      )}
      
      {nextPageUrl && (
        <div className="flex justify-center pt-8 pb-4">
          <button
            onClick={loadMore}
            disabled={isFetchingMore}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none"
          >
            {isFetchingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {labels.loading}
              </>
            ) : (
              labels.loadMore
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function FieldShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-[0_14px_30px_-28px_rgba(15,23,42,0.72)]">
      {label}
    </span>
  );
}

function CatalogEmptyState() {
  return (
    <section className="rounded-[2rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-6 py-14 text-center shadow-[0_26px_72px_-54px_rgba(15,23,42,0.78)]">
      <div className="mx-auto max-w-xl space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Catalogue unavailable
        </div>
        <h2 className="text-2xl font-semibold text-foreground">
          No public products are published yet
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          The branch has not published any active products to the public catalogue
          yet. Check back later or go directly to the enquiry form.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            href={ROUTES.public.apply}
            className="public-action-primary h-11 !min-h-0 justify-center px-5"
          >
            Open enquiry form
          </Link>
          <Link
            href={ROUTES.public.home}
            className="inline-flex h-11 items-center rounded-xl border border-border bg-card px-5 text-sm font-medium text-foreground shadow-[0_18px_40px_-28px_rgba(15,23,42,0.72)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
          >
            Return home
          </Link>
        </div>
      </div>
    </section>
  );
}

function FilteredEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <section className="rounded-[2rem] border border-dashed border-border bg-white/70 dark:bg-transparent px-6 py-14 text-center shadow-[0_24px_64px_-54px_rgba(15,23,42,0.66)] dark:shadow-none">
      <div className="mx-auto max-w-lg space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          No filtered matches
        </div>
        <h2 className="text-2xl font-semibold text-foreground">
          No products match the current search
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Adjust the category or price band, or clear the filters to return to the
          full live catalogue.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-11 items-center rounded-xl border border-border bg-card px-5 text-sm font-medium text-foreground shadow-[0_18px_40px_-28px_rgba(15,23,42,0.72)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
        >
          Clear all filters
        </button>
      </div>
    </section>
  );
}
