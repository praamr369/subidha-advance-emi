"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";

import PublicProductMedia from "@/components/public/PublicProductMedia";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import ProductCard3D from "@/components/public/ui/ProductCard3D";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { PublicProduct } from "@/services/public";

type PriceRange = {
  min: number;
  max: number;
};

const DEFAULT_PRICE_RANGE: PriceRange = {
  min: 0,
  max: Infinity,
};

export default function ProductGrid({ products, locale = "en" }: { products: PublicProduct[]; locale?: "en" | "hi" | "bn" }) {
  const labels = locale === "hi" ? {
    hideFilters: "फ़िल्टर छिपाएँ", showFilters: "फ़िल्टर दिखाएँ", filters: "कैटलॉग फ़िल्टर", narrow: "लाइव कैटलॉग को फ़िल्टर करें", reset: "फ़िल्टर रीसेट करें", search: "खोज", searchPlaceholder: "नाम, कोड, या विवरण", category: "श्रेणी", allCategories: "सभी श्रेणियाँ", subcategory: "उप-श्रेणी", allSubcategories: "सभी उप-श्रेणियाँ", priceBand: "कीमत सीमा", min: "न्यूनतम", max: "अधिकतम", results: "लाइव परिणाम", showing: "दिखा रहा है", of: "में से", published: "प्रकाशित उत्पाद", liveView: "लाइव कैटलॉग", any: "कोई भी"
  } : locale === "bn" ? {
    hideFilters: "ফিল্টার লুকান", showFilters: "ফিল্টার দেখুন", filters: "ক্যাটালগ ফিল্টার", narrow: "লাইভ ক্যাটালগ ছাঁকুন", reset: "ফিল্টার রিসেট", search: "সার্চ", searchPlaceholder: "নাম, কোড, বা বিবরণ", category: "ক্যাটাগরি", allCategories: "সব ক্যাটাগরি", subcategory: "সাব-ক্যাটাগরি", allSubcategories: "সব সাব-ক্যাটাগরি", priceBand: "দামের সীমা", min: "ন্যূনতম", max: "সর্বোচ্চ", results: "লাইভ ফলাফল", showing: "দেখানো হচ্ছে", of: "মোট", published: "প্রকাশিত পণ্য", liveView: "লাইভ ক্যাটালগ", any: "যেকোনো"
  } : {
    hideFilters: "Hide filters", showFilters: "Show filters", filters: "Catalogue Filters", narrow: "Narrow the live furniture catalogue", reset: "Reset filters", search: "Search", searchPlaceholder: "Name, code, or description", category: "Category", allCategories: "All categories", subcategory: "Subcategory", allSubcategories: "All subcategories", priceBand: "Price band", min: "Min", max: "Max", results: "Live results", showing: "Showing", of: "of", published: "published products", liveView: "Live catalogue view", any: "Any"
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [priceRange, setPriceRange] = useState<PriceRange>(DEFAULT_PRICE_RANGE);
  const [showFilters, setShowFilters] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const categories = useMemo(() => {
    const values = new Set<string>();

    for (const product of products) {
      if (product.category) {
        values.add(product.category);
      }
    }

    return Array.from(values).sort();
  }, [products]);

  const subcategories = useMemo(() => {
    const values = new Set<string>();

    for (const product of products) {
      if (
        product.subcategory &&
        (!selectedCategory || product.category === selectedCategory)
      ) {
        values.add(product.subcategory);
      }
    }

    return Array.from(values).sort();
  }, [products, selectedCategory]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = deferredSearchQuery.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.product_code.toLowerCase().includes(normalizedSearch) ||
        (product.description?.toLowerCase().includes(normalizedSearch) ?? false);

      const matchesCategory =
        !selectedCategory || product.category === selectedCategory;
      const matchesSubcategory =
        !selectedSubcategory || product.subcategory === selectedSubcategory;

      const numericPrice = Number(product.base_price);
      const matchesPrice =
        Number.isFinite(numericPrice) &&
        numericPrice >= priceRange.min &&
        (priceRange.max === Infinity || numericPrice <= priceRange.max);

      return matchesSearch && matchesCategory && matchesSubcategory && matchesPrice;
    });
  }, [products, deferredSearchQuery, selectedCategory, selectedSubcategory, priceRange]);

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

  if (products.length === 0) {
    return <CatalogEmptyState />;
  }

  return (
    <div className="space-y-6">
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setShowFilters((current) => !current)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/75 bg-white/85 px-4 py-3 text-sm font-medium text-foreground shadow-[0_22px_48px_-36px_rgba(15,23,42,0.76)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {showFilters ? labels.hideFilters : labels.showFilters}
        </button>
      </div>

      <section
        className={cn(
          "rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] p-5 shadow-[0_28px_72px_-54px_rgba(15,23,42,0.76)]",
          showFilters ? "block" : "hidden md:block"
        )}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
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
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-medium text-foreground shadow-[0_18px_36px_-28px_rgba(15,23,42,0.72)] transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 focus-visible:ring-offset-2"
              >
                <X className="h-4 w-4" />
                {labels.reset}
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.8fr))]">
            <FieldShell label={labels.search}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={labels.searchPlaceholder}
                  className="public-control-focus h-12 w-full rounded-2xl border border-slate-200/80 bg-white/90 pl-10 pr-4 text-sm text-foreground"
                />
              </div>
            </FieldShell>

            <FieldShell label={labels.category}>
              <select
                value={selectedCategory}
                onChange={(event) => {
                  setSelectedCategory(event.target.value);
                  setSelectedSubcategory("");
                }}
                className="public-control-focus h-12 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-3 text-sm text-foreground"
              >
                <option value="">{labels.allCategories}</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </FieldShell>

            <FieldShell label={labels.subcategory}>
              <select
                value={selectedSubcategory}
                onChange={(event) => setSelectedSubcategory(event.target.value)}
                className="public-control-focus h-12 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-3 text-sm text-foreground"
                disabled={!selectedCategory && subcategories.length === 0}
              >
                <option value="">{labels.allSubcategories}</option>
                {subcategories.map((subcategory) => (
                  <option key={subcategory} value={subcategory}>
                    {subcategory}
                  </option>
                ))}
              </select>
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
                  className="public-control-focus h-12 rounded-2xl border border-slate-200/80 bg-white/90 px-3 text-sm text-foreground"
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
                  className="public-control-focus h-12 rounded-2xl border border-slate-200/80 bg-white/90 px-3 text-sm text-foreground"
                />
              </div>
            </FieldShell>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-[1.9rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-5 py-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.72)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {labels.results}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {labels.showing} {filteredProducts.length} {labels.of} {products.length} {labels.published}.
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
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" />
              {labels.liveView}
            </div>
          ) : null}
        </div>
      </section>

      {filteredProducts.length === 0 ? (
        <FilteredEmptyState onReset={resetFilters} />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 lg:gap-8">
          {filteredProducts.map((product) => {
            const price = Number(product.base_price) || 0;
            const emiAmount = Math.round(price / 12);
            return (
              <ProductCard3D
                key={product.id}
                id={product.id}
                title={product.name}
                category={product.category || "Uncategorized"}
                price={price}
                emiAmount={emiAmount}
                imageUrl={product.image || ""}
                href={`/products/${product.id}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function FieldShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/80 bg-white/82 px-3 py-1 text-xs font-medium text-slate-700 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.72)]">
      {label}
    </span>
  );
}

function CatalogEmptyState() {
  return (
    <section className="rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-6 py-14 text-center shadow-[0_26px_72px_-54px_rgba(15,23,42,0.78)]">
      <div className="mx-auto max-w-xl space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
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
            className="inline-flex h-11 items-center rounded-xl border border-white/80 bg-white/80 px-5 text-sm font-medium text-foreground shadow-[0_18px_40px_-28px_rgba(15,23,42,0.72)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
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
    <section className="rounded-[2rem] border border-dashed border-slate-300/80 bg-white/70 px-6 py-14 text-center shadow-[0_24px_64px_-54px_rgba(15,23,42,0.66)]">
      <div className="mx-auto max-w-lg space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
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
          className="inline-flex h-11 items-center rounded-xl border border-white/80 bg-white px-5 text-sm font-medium text-foreground shadow-[0_18px_40px_-28px_rgba(15,23,42,0.72)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
        >
          Clear all filters
        </button>
      </div>
    </section>
  );
}



