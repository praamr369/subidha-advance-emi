"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState, useCallback } from "react";
import {
  ArrowUpDown,
  Check,
  Filter,
  Heart,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  Package,
} from "lucide-react";

import ProductCard3D from "@/components/public/ui/ProductCard3D";
import { buildProductSlides } from "@/components/public/ui/product-slides";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { listPublicProducts, type PublicProduct, type PublicProductCategory } from "@/services/public";
import { useWishlist } from "@/lib/wishlist";

type SortOption = "discover" | "price_asc" | "price_desc" | "newest" | "name_asc";

type PriceQuickFilter = {
  label: string;
  min: number;
  max: number;
};

const PRICE_QUICK_FILTERS: PriceQuickFilter[] = [
  { label: "All Prices", min: 0, max: Infinity },
  { label: "Under ₹15,000", min: 0, max: 15000 },
  { label: "₹15k - ₹30k", min: 15000, max: 30000 },
  { label: "₹30k - ₹50k", min: 30000, max: 50000 },
  { label: "₹50,000+", min: 50000, max: Infinity },
];

function getCategoryIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("sofa") || n.includes("living") || n.includes("couch")) return "🛋️";
  if (n.includes("bed") || n.includes("bedroom")) return "🛏️";
  if (n.includes("wardrobe") || n.includes("storage") || n.includes("almirah") || n.includes("closet")) return "🚪";
  if (n.includes("dining") || n.includes("table")) return "🍽️";
  if (n.includes("mattress")) return "🛏️";
  if (n.includes("appliance") || n.includes("fridge") || n.includes("tv") || n.includes("machine") || n.includes("electronic")) return "⚡";
  if (n.includes("chair") || n.includes("office") || n.includes("desk")) return "🪑";
  return "📦";
}

function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const arr = [...array];
  let m = arr.length;
  let s = seed;
  while (m) {
    s = (s * 9301 + 49297) % 233280;
    const rnd = s / 233280;
    const i = Math.floor(rnd * m--);
    const t = arr[m];
    arr[m] = arr[i];
    arr[i] = t;
  }
  return arr;
}

function interleaveByCategory(items: PublicProduct[], seed: number = 1): PublicProduct[] {
  if (items.length <= 2) return items;

  const groups: Record<string, PublicProduct[]> = {};
  for (const item of items) {
    const cat = (item.category || "Uncategorized").trim();
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }

  const categories = Object.keys(groups);
  for (const cat of categories) {
    groups[cat] = shuffleWithSeed(groups[cat], seed);
  }

  const result: PublicProduct[] = [];
  const maxLen = Math.max(...categories.map((c) => groups[c].length));

  for (let i = 0; i < maxLen; i++) {
    for (const cat of categories) {
      if (i < groups[cat].length) {
        result.push(groups[cat][i]);
      }
    }
  }

  return result;
}

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
  const { wishlist, count: wishlistCount } = useWishlist();

  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [selectedPriceFilter, setSelectedPriceFilter] = useState<number>(0);
  const [sortOption, setSortOption] = useState<SortOption>("discover");
  const [showWishlistOnly, setShowWishlistOnly] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [discoverySeed, setDiscoverySeed] = useState<number>(() => Math.floor(Math.random() * 1000) + 1);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const [products, setProducts] = useState<PublicProduct[]>(initialProducts);
  const [totalCount, setTotalCount] = useState<number>(initialCount);
  const [nextPageUrl, setNextPageUrl] = useState<string | null>(initialNext);
  const [currentPage, setCurrentPage] = useState(1);
  const [isFetching, setIsFetching] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  // Active filter computation
  const activePriceRange = PRICE_QUICK_FILTERS[selectedPriceFilter] ?? PRICE_QUICK_FILTERS[0];
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedCategory.length > 0 ||
    selectedSubcategory.length > 0 ||
    selectedPriceFilter !== 0 ||
    showWishlistOnly;

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCategory("");
    setSelectedSubcategory("");
    setSelectedPriceFilter(0);
    setShowWishlistOnly(false);
    setSortOption("discover");
  }, []);

  // Fetch when search, category, subcategory, or price changes
  useEffect(() => {
    let isMounted = true;

    // Skip redundant initial fetch
    if (!hasActiveFilters && currentPage === 1 && initialProducts.length > 0 && sortOption === "discover") {
      if (initialSearch === searchQuery) return;
    }

    const fetchFiltered = async () => {
      setIsFetching(true);
      try {
        const orderingParam =
          sortOption === "price_asc"
            ? "price_asc"
            : sortOption === "price_desc"
            ? "price_desc"
            : sortOption === "newest"
            ? "newest"
            : sortOption === "name_asc"
            ? "name_asc"
            : undefined;

        const payload = await listPublicProducts({
          page: 1,
          limit: 24,
          search: deferredSearchQuery,
          category: selectedCategory || undefined,
          subcategory: selectedSubcategory || undefined,
          min_price: activePriceRange.min > 0 ? activePriceRange.min : undefined,
          max_price: activePriceRange.max !== Infinity ? activePriceRange.max : undefined,
          ordering: orderingParam,
        });

        if (isMounted) {
          setProducts(payload.products);
          setTotalCount(payload.count);
          setNextPageUrl(payload.next || null);
          setCurrentPage(1);
        }
      } catch (err) {
        console.error("Error loading products:", err);
      } finally {
        if (isMounted) setIsFetching(false);
      }
    };

    fetchFiltered();

    return () => {
      isMounted = false;
    };
  }, [
    deferredSearchQuery,
    selectedCategory,
    selectedSubcategory,
    activePriceRange.min,
    activePriceRange.max,
    sortOption,
    initialProducts.length,
    initialSearch,
  ]);

  // Load more pagination
  const loadMore = async () => {
    if (!nextPageUrl || isFetchingMore) return;

    setIsFetchingMore(true);
    const nextPage = currentPage + 1;
    try {
      const orderingParam =
        sortOption === "price_asc"
          ? "price_asc"
          : sortOption === "price_desc"
          ? "price_desc"
          : sortOption === "newest"
          ? "newest"
          : sortOption === "name_asc"
          ? "name_asc"
          : undefined;

      const payload = await listPublicProducts({
        page: nextPage,
        limit: 24,
        search: deferredSearchQuery,
        category: selectedCategory || undefined,
        subcategory: selectedSubcategory || undefined,
        min_price: activePriceRange.min > 0 ? activePriceRange.min : undefined,
        max_price: activePriceRange.max !== Infinity ? activePriceRange.max : undefined,
        ordering: orderingParam,
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

  // Build list of category tabs
  const categoryPills = useMemo(() => {
    const list: Array<{ name: string; label: string; icon: string }> = [
      { name: "", label: "All Items", icon: "✨" },
    ];

    if (serverCategories && serverCategories.length > 0) {
      for (const cat of serverCategories) {
        list.push({
          name: cat.name,
          label: cat.name,
          icon: getCategoryIcon(cat.name),
        });
      }
    } else {
      // Derive from loaded products
      const unique = Array.from(new Set(initialProducts.map((p) => (p.category || "").trim()).filter(Boolean)));
      for (const cat of unique) {
        list.push({
          name: cat,
          label: cat,
          icon: getCategoryIcon(cat),
        });
      }
    }

    return list;
  }, [serverCategories, initialProducts]);

  // Process & Order Display Products
  const displayedProducts = useMemo(() => {
    let list = [...products];

    // Filter wishlist only
    if (showWishlistOnly) {
      const wishIds = new Set(wishlist.map((w) => String(w.id)));
      const wishCodes = new Set(wishlist.map((w) => w.product_code));
      list = list.filter((p) => wishIds.has(String(p.id)) || wishCodes.has(p.product_code));
    }

    // Apply sorting & category diversity
    if (sortOption === "discover") {
      if (!selectedCategory) {
        // Diverse cross-category mix
        list = interleaveByCategory(list, discoverySeed);
      } else {
        // Category-specific shuffle/randomness
        list = shuffleWithSeed(list, discoverySeed);
      }
    } else if (sortOption === "price_asc") {
      list.sort((a, b) => {
        const pA = Number(a.scheme_pricing?.cash_price ?? a.base_price) || 0;
        const pB = Number(b.scheme_pricing?.cash_price ?? b.base_price) || 0;
        return pA - pB;
      });
    } else if (sortOption === "price_desc") {
      list.sort((a, b) => {
        const pA = Number(a.scheme_pricing?.cash_price ?? a.base_price) || 0;
        const pB = Number(b.scheme_pricing?.cash_price ?? b.base_price) || 0;
        return pB - pA;
      });
    } else if (sortOption === "newest") {
      list.sort((a, b) => Number(b.id) - Number(a.id));
    } else if (sortOption === "name_asc") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [products, showWishlistOnly, wishlist, sortOption, selectedCategory, discoverySeed]);

  const handleShuffleDiscovery = () => {
    setDiscoverySeed((prev) => prev + 17);
    if (sortOption !== "discover") {
      setSortOption("discover");
    }
    showToast("Refreshed discovery mix! 🎲");
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border/80 bg-foreground/95 px-5 py-2.5 text-xs font-semibold text-background shadow-xl backdrop-blur-md transition-all animate-in fade-in zoom-in-95">
          {toastMessage}
        </div>
      )}

      {/* TOP BAR: Search Bar + Quick Actions */}
      <div className="rounded-2xl border border-border/80 bg-card p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Main Search Input */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sofas, beds, dining tables, wardrobes, appliances..."
              className="h-11 w-full rounded-xl border border-border/70 bg-muted/50 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search query"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick Buttons: Wishlist & Advanced Filters */}
          <div className="flex items-center gap-2">
            {/* Wishlist Toggle Button */}
            <button
              type="button"
              onClick={() => {
                setShowWishlistOnly((prev) => !prev);
                if (!showWishlistOnly) {
                  showToast(wishlistCount > 0 ? "Showing Wishlist items ❤️" : "Your wishlist is empty 🤍");
                }
              }}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold transition-all active:scale-95 shadow-sm",
                showWishlistOnly
                  ? "border-rose-400 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/80 dark:text-rose-300"
                  : "border-border/70 bg-background text-foreground hover:bg-muted"
              )}
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  showWishlistOnly ? "fill-rose-500 text-rose-500" : "text-muted-foreground"
                )}
              />
              <span>Wishlist</span>
              {wishlistCount > 0 && (
                <span
                  className={cn(
                    "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                    showWishlistOnly ? "bg-rose-600 text-white" : "bg-primary text-primary-foreground"
                  )}
                >
                  {wishlistCount}
                </span>
              )}
            </button>

            {/* Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              aria-label="Toggle filters"
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold transition-all active:scale-95 shadow-sm",
                showAdvancedFilters || selectedPriceFilter !== 0 || selectedSubcategory
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/70 bg-background text-foreground hover:bg-muted"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {(selectedPriceFilter !== 0 || selectedSubcategory) && (
                <span className="h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          </div>
        </div>

        {/* HORIZONTAL CATEGORY PILLS STRIP */}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 pt-1 no-scrollbar scroll-smooth">
          {categoryPills.map((pill) => {
            const isSelected = selectedCategory === pill.name;
            return (
              <button
                key={pill.name || "all"}
                type="button"
                onClick={() => {
                  setSelectedCategory(pill.name);
                  setSelectedSubcategory("");
                  setShowWishlistOnly(false);
                }}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95",
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20 scale-[1.02]"
                    : "border border-border/70 bg-background text-muted-foreground hover:border-border hover:bg-muted/80 hover:text-foreground"
                )}
              >
                <span>{pill.icon}</span>
                <span>{pill.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ADVANCED FILTER PANEL (EXPANDABLE) */}
      {showAdvancedFilters && (
        <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm animate-in fade-in-50 slide-in-from-top-2">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Filter className="h-3.5 w-3.5 text-primary" />
              Refine Furniture Catalogue
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 hover:underline"
              >
                <X className="h-3.5 w-3.5" />
                Reset all
              </button>
            )}
          </div>

          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Price Ranges */}
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">Price Range</label>
              <div className="flex flex-wrap gap-1.5">
                {PRICE_QUICK_FILTERS.map((p, idx) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setSelectedPriceFilter(idx)}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors border",
                      selectedPriceFilter === idx
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subcategory Input */}
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">Subcategory (e.g. L-Shape, Recliner, King)</label>
              <input
                type="text"
                value={selectedSubcategory}
                onChange={(e) => setSelectedSubcategory(e.target.value)}
                placeholder="E.g. Fabric, Teak, 3-Seater"
                className="h-9 w-full rounded-xl border border-border/70 bg-muted/40 px-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:bg-background focus:outline-none"
              />
            </div>

            {/* Close Bar */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(false)}
                className="inline-flex h-9 w-full items-center justify-center rounded-xl bg-muted px-4 text-xs font-semibold text-foreground hover:bg-muted/80"
              >
                Apply & Close
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TOOLBAR: Count, Shuffle Discovery, Sort Dropdown */}
      <section className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border/70 bg-card px-4 py-2.5 shadow-sm">
        {/* Results Count & Loader */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Showing <strong className="text-foreground">{displayedProducts.length}</strong> of{" "}
            <strong className="text-foreground">{totalCount}</strong> products
          </span>
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        </div>

        {/* Sort & Shuffle Controls */}
        <div className="flex items-center gap-2">
          {/* Discovery Shuffle Button (Random Variety) */}
          <button
            type="button"
            onClick={handleShuffleDiscovery}
            title="Shuffle products for fresh variety"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2.5 text-xs font-semibold text-foreground hover:bg-muted active:scale-95 transition-all shadow-xs"
          >
            <RefreshCw className="h-3 w-3 text-primary" />
            <span className="hidden xs:inline">Shuffle</span>
          </button>

          {/* Sort Selector Dropdown */}
          <div className="relative">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="h-8 appearance-none rounded-lg border border-border/70 bg-muted/40 pl-2.5 pr-7 text-xs font-semibold text-foreground hover:bg-muted focus:border-primary focus:outline-none cursor-pointer"
            >
              <option value="discover">🎲 Discover / Explore (Variety)</option>
              <option value="price_asc">🏷️ Price: Low to High</option>
              <option value="price_desc">💎 Price: High to Low</option>
              <option value="newest">🆕 New Arrivals</option>
              <option value="name_asc">🔤 Name: A to Z</option>
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      </section>

      {/* ACTIVE FILTER PILLS ROW */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Active:
          </span>
          {searchQuery && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted px-2.5 py-0.5 text-xs text-foreground">
              Search: &quot;{searchQuery}&quot;
              <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search filter">
                <X className="h-3 w-3 hover:text-rose-500" />
              </button>
            </span>
          )}
          {selectedCategory && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted px-2.5 py-0.5 text-xs text-foreground">
              {selectedCategory}
              <button type="button" onClick={() => setSelectedCategory("")} aria-label="Clear category filter">
                <X className="h-3 w-3 hover:text-rose-500" />
              </button>
            </span>
          )}
          {selectedSubcategory && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted px-2.5 py-0.5 text-xs text-foreground">
              Sub: {selectedSubcategory}
              <button type="button" onClick={() => setSelectedSubcategory("")} aria-label="Clear subcategory filter">
                <X className="h-3 w-3 hover:text-rose-500" />
              </button>
            </span>
          )}
          {selectedPriceFilter !== 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted px-2.5 py-0.5 text-xs text-foreground">
              {activePriceRange.label}
              <button type="button" onClick={() => setSelectedPriceFilter(0)} aria-label="Clear price filter">
                <X className="h-3 w-3 hover:text-rose-500" />
              </button>
            </span>
          )}
          {showWishlistOnly && (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/80 dark:text-rose-300 font-semibold">
              Wishlist Only ({wishlistCount})
              <button type="button" onClick={() => setShowWishlistOnly(false)} aria-label="Disable wishlist only view">
                <X className="h-3 w-3 hover:text-rose-500" />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-semibold text-primary hover:underline ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* PRODUCT GRID: 2 COLUMNS ON MOBILE, 3-4 ON DESKTOP */}
      {displayedProducts.length === 0 && !isFetching ? (
        showWishlistOnly ? (
          <WishlistEmptyState onExplore={() => setShowWishlistOnly(false)} />
        ) : (
          <FilteredEmptyState onReset={resetFilters} />
        )
      ) : (
        <div
          className={cn(
            "grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 transition-opacity duration-300",
            isFetching ? "opacity-50 pointer-events-none" : "opacity-100"
          )}
        >
          {displayedProducts.map((product) => {
            const pricing = product.scheme_pricing;
            const basePrice = Number(product.base_price) || 0;
            const price = Number(pricing?.cash_price ?? product.base_price) || 0;
            const originalPrice = pricing?.cash_has_discount
              ? Number(pricing.cash_base_price ?? product.base_price) || 0
              : null;
            const monthly = pricing?.lowest_monthly != null ? Number(pricing.lowest_monthly) : null;

            return (
              <ProductCard3D
                key={`${product.id}-${product.product_code}`}
                id={String(product.id)}
                productCode={product.product_code}
                title={product.seo_name || product.name}
                category={product.category || "Uncategorized"}
                subcategory={product.subcategory}
                price={price || basePrice}
                emiAmount={monthly != null ? Math.round(monthly) : 0}
                hideMonthly={monthly == null}
                originalPrice={originalPrice}
                imageUrl={product.image || ""}
                media={buildProductSlides(product)}
                href={`/products/${product.product_code}`}
                attributes={product.pim_attributes}
                rentYieldEstimates={product.rent_yield_estimates}
                stockStatus={product.stock_status}
                onToast={showToast}
              />
            );
          })}
        </div>
      )}

      {/* LOAD MORE BUTTON */}
      {nextPageUrl && !showWishlistOnly && (
        <div className="flex justify-center pt-8 pb-4">
          <button
            type="button"
            onClick={loadMore}
            disabled={isFetchingMore}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none active:scale-98"
          >
            {isFetchingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more products...
              </>
            ) : (
              "Load More Products"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function WishlistEmptyState({ onExplore }: { onExplore: () => void }) {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-card/60 p-8 sm:p-12 text-center shadow-xs">
      <div className="mx-auto max-w-md space-y-3">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-500">
          <Heart className="h-7 w-7" />
        </div>
        <h3 className="text-xl font-bold text-foreground">Your Wishlist is Empty</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tap the heart icon ❤️ on any sofa, bed, dining table, or appliance to save your favorite furniture here and compare them anytime.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onExplore}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            Explore Catalogue
          </button>
        </div>
      </div>
    </section>
  );
}

function FilteredEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-card/60 p-8 sm:p-12 text-center shadow-xs">
      <div className="mx-auto max-w-md space-y-3">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Package className="h-7 w-7" />
        </div>
        <h3 className="text-xl font-bold text-foreground">No Products Found</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We could not find any products matching your current search or filter combination.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-6 text-sm font-semibold text-foreground shadow-xs transition hover:bg-muted"
          >
            Clear All Filters
          </button>
        </div>
      </div>
    </section>
  );
}
