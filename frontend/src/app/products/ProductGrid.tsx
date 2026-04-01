"use client";

import { useState, useMemo } from "react";
import { Search, X, Filter } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { PublicProduct } from "@/services/public";

export default function ProductGrid({ products }: { products: PublicProduct[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("");
  const [priceRange, setPriceRange] = useState<{ min: number; max: number }>({
    min: 0,
    max: Infinity,
  });
  const [showFilters, setShowFilters] = useState(false); // For mobile

  // Extract unique categories and subcategories from the products
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [products]);

  const subcategories = useMemo(() => {
    const subs = new Set<string>();
    products.forEach((p) => {
      if (p.subcategory && (!selectedCategory || p.category === selectedCategory)) {
        subs.add(p.subcategory);
      }
    });
    return Array.from(subs).sort();
  }, [products, selectedCategory]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        searchQuery === "" ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.product_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

      const matchesCategory = selectedCategory === "" || product.category === selectedCategory;
      const matchesSubcategory =
        selectedSubcategory === "" || product.subcategory === selectedSubcategory;
      const price = parseFloat(product.base_price);
      const matchesPrice = price >= priceRange.min && (priceRange.max === Infinity || price <= priceRange.max);

      return matchesSearch && matchesCategory && matchesSubcategory && matchesPrice;
    });
  }, [products, searchQuery, selectedCategory, selectedSubcategory, priceRange]);

  // Reset all filters
  const resetFilters = () => {
    setSearchQuery("");
    setSelectedCategory("");
    setSelectedSubcategory("");
    setPriceRange({ min: 0, max: Infinity });
  };

  const hasActiveFilters =
    searchQuery !== "" ||
    selectedCategory !== "" ||
    selectedSubcategory !== "" ||
    priceRange.min > 0 ||
    priceRange.max !== Infinity;

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center">
        <div className="text-muted-foreground">No products available at the moment.</div>
        <p className="mt-2 text-sm text-muted-foreground">Please check back later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Mobile filter toggle */}
      <div className="md:hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-2 text-sm font-medium text-foreground"
        >
          <Filter className="h-4 w-4" />
          {showFilters ? "Hide Filters" : "Show Filters"}
        </button>
      </div>

      {/* Filters Bar */}
      <div className={`${showFilters ? "block" : "hidden md:block"} rounded-xl border border-border bg-card p-4 shadow-sm`}>
        <div className="flex flex-wrap items-end gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Search
            </label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, code, description..."
                className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Category */}
          <div className="w-40">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSelectedSubcategory("");
              }}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Subcategory */}
          <div className="w-40">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Subcategory
            </label>
            <select
              value={selectedSubcategory}
              onChange={(e) => setSelectedSubcategory(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={!selectedCategory && subcategories.length === 0}
            >
              <option value="">All Subcategories</option>
              {subcategories.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>

          {/* Price Range */}
          <div className="flex gap-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Min Price
              </label>
              <input
                type="number"
                placeholder="0"
                value={priceRange.min === 0 ? "" : priceRange.min}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setPriceRange((prev) => ({ ...prev, min: isNaN(val) ? 0 : val }));
                }}
                className="mt-1 h-10 w-24 rounded-xl border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Max Price
              </label>
              <input
                type="number"
                placeholder="Any"
                value={priceRange.max === Infinity ? "" : priceRange.max}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setPriceRange((prev) => ({ ...prev, max: isNaN(val) ? Infinity : val }));
                }}
                className="mt-1 h-10 w-24 rounded-xl border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground transition hover:bg-muted"
            >
              <X className="h-4 w-4" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {filteredProducts.length} of {products.length} products
        </div>
        {hasActiveFilters && filteredProducts.length === 0 && (
          <div className="text-sm text-muted-foreground">No products match your filters.</div>
        )}
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}

function ProductCard({ product }: { product: PublicProduct }) {
  const price = parseFloat(product.base_price).toFixed(2);

  return (
    <Link href={`/products/${product.id}`} className="group">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1">
        {/* Image */}
        <div className="relative h-48 w-full overflow-hidden bg-muted">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <span className="text-sm">No image</span>
            </div>
          )}
          {product.category && (
            <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
              {product.category}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="mb-1 text-xs text-muted-foreground">{product.product_code}</div>
          <h3 className="line-clamp-2 text-lg font-semibold text-foreground">{product.name}</h3>
          {product.subcategory && (
            <p className="mt-1 text-sm text-muted-foreground">{product.subcategory}</p>
          )}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xl font-bold text-primary">₹{price}</span>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary transition group-hover:gap-2">
              View Details
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
