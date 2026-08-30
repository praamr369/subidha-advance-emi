"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import PublicProductDetailMedia from "./PublicProductDetailMedia";
import PublicProductVariantSelector from "./PublicProductVariantSelector";
import ProductEnquiryHandoffPanel from "./ProductEnquiryHandoffPanel";
import PublicProductDescriptionAndSpecs from "./PublicProductDescriptionAndSpecs";
import type { PublicProduct } from "@/services/public";

type Props = {
  initialProduct: PublicProduct;
  initialSelectedAttributes: Record<string, string>;
  dict: any;
};

// Soft match: only fail if the variant HAS the attribute but with a different value.
function softMatch(
  v: NonNullable<PublicProduct["pim_variants"]>[0],
  attrs: Record<string, string>
): boolean {
  for (const [key, val] of Object.entries(attrs)) {
    if (key in v.attributes && v.attributes[key] !== val) return false;
  }
  return true;
}

export default function PublicProductInteractiveDetail({
  initialProduct,
  initialSelectedAttributes,
  dict,
}: Props) {
  const [selectedAttributes, setSelectedAttributes] = useState(initialSelectedAttributes);

  useEffect(() => {
    setSelectedAttributes(initialSelectedAttributes);
  }, [initialSelectedAttributes]);

  const handleAttributeSelect = (attributeName: string, value: string) => {
    const candidate = { ...selectedAttributes, [attributeName]: value };

    // Drop stale attrs that don't exist in any variant carrying the new value
    const variants = initialProduct.pim_variants ?? [];
    const keysInRelevant = new Set(
      variants
        .filter((v) => v.attributes[attributeName] === value)
        .flatMap((v) => Object.keys(v.attributes))
    );
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(candidate)) {
      if (keysInRelevant.has(k) || k === attributeName) cleaned[k] = v;
    }

    setSelectedAttributes(cleaned);

    const url = new URL(window.location.href);
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith("attr_")) url.searchParams.delete(key);
    }
    for (const [k, v] of Object.entries(cleaned)) {
      url.searchParams.set(`attr_${k}`, v);
    }
    window.history.replaceState(null, "", url.toString());
  };

  // Variant matching (strict first, soft fallback)
  let matchedVariant: NonNullable<PublicProduct["pim_variants"]>[0] | null = null;
  if (
    initialProduct.pim_variants &&
    initialProduct.pim_variants.length > 0 &&
    Object.keys(selectedAttributes).length > 0
  ) {
    let matches = initialProduct.pim_variants.filter((v) =>
      Object.entries(selectedAttributes).every(([k, val]) => v.attributes[k] === val)
    );
    if (matches.length === 0) {
      matches = initialProduct.pim_variants.filter((v) => softMatch(v, selectedAttributes));
    }
    if (matches.length > 0) {
      matches.sort((a, b) => Number(a.price) - Number(b.price));
      matchedVariant = matches[0];
    }
  }

  // Merge variant attrs into spec list
  const mergedPimAttributes = (() => {
    if (!matchedVariant) return initialProduct.pim_attributes;
    const base = initialProduct.pim_attributes ?? [];
    const variantAttrs = matchedVariant.attributes;
    const updated = base.map((attr) =>
      attr.name in variantAttrs ? { ...attr, value: variantAttrs[attr.name] } : attr
    );
    const baseNames = new Set(base.map((a) => a.name));
    for (const [name, value] of Object.entries(variantAttrs)) {
      if (!baseNames.has(name)) updated.push({ name, value });
    }
    return updated;
  })();

  const displayProduct = matchedVariant
    ? {
        ...initialProduct,
        base_price: matchedVariant.price,
        price_range: null,
        product_code: matchedVariant.sku,
        image: matchedVariant.image || initialProduct.image,
        stock_status: matchedVariant.stock_status,
        pim_attributes: mergedPimAttributes,
      }
    : initialProduct;

  const factRows = [
    { label: "Category", value: displayProduct.category || "Not classified" },
    { label: "Subcategory", value: displayProduct.subcategory || "Not classified" },
  ];

  const isVariantPage = Boolean(initialProduct.is_variant_page);
  const siblings = initialProduct.sibling_variants ?? [];
  const hasVariants = (initialProduct.pim_variants?.length ?? 0) > 0;

  return (
    <>
      <section className="public-surface relative overflow-hidden p-6 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/70 to-transparent" />

        {/* Back to base product link — shown on variant pages */}
        {isVariantPage && initialProduct.parent_product_id && (
          <div className="mb-6">
            <Link
              href={`/products/${initialProduct.parent_product_code || initialProduct.parent_product_id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              View all variants of this product
            </Link>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-4">
            <PublicProductDetailMedia
              product={displayProduct}
              carouselAriaLabel={dict.common.mediaCarousel.productGalleryLabel}
              prevLabel={dict.common.mediaCarousel.previousSlide}
              nextLabel={dict.common.mediaCarousel.nextSlide}
            />

            {/* Base product: variant attribute selector */}
            {!isVariantPage && hasVariants && (
              <div className="mt-4 rounded-[1.5rem] border border-border bg-card p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold text-foreground">Available Options</h3>
                <PublicProductVariantSelector
                  variants={initialProduct.pim_variants!}
                  selectedAttributes={selectedAttributes}
                  onAttributeSelect={handleAttributeSelect}
                />
                {/* Deep-link to selected variant's own page */}
                {matchedVariant?.product_id && (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <Link
                      href={`/products/${matchedVariant.product_code || matchedVariant.product_id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      Open dedicated page for this variant
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Variant page: sibling switcher */}
            {isVariantPage && siblings.length > 0 && (
              <div className="mt-4 rounded-[1.5rem] border border-border bg-card p-5 shadow-sm">
                <h3 className="mb-1 text-sm font-semibold text-foreground">Other variants</h3>
                <p className="mb-4 text-xs text-muted-foreground">Each variant is its own page with its own price.</p>
                <div className="flex flex-wrap gap-2">
                  {siblings.map((s) => (
                    <Link
                      key={s.product_id}
                      href={`/products/${s.product_code || s.product_id}`}
                      className={`inline-flex flex-col items-start rounded-xl border px-4 py-2.5 text-left transition min-w-[100px] ${
                        s.is_current
                          ? "border-primary bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] ring-1 ring-primary"
                          : "border-border/70 hover:border-border hover:bg-muted"
                      }`}
                    >
                      <span className={`text-sm font-semibold ${s.is_current ? "text-primary" : "text-foreground"}`}>
                        {s.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground mt-0.5">
                        {formatCurrency(s.price)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Fact chips */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {factRows.map((fact) => (
                <div
                  key={fact.label}
                  className="public-card p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.24)] dark:shadow-none"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {fact.label}
                  </div>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    {fact.value}
                  </div>
                </div>
              ))}

              {/* Stock status chip */}
              {(() => {
                const stockStatus = isVariantPage
                  ? (displayProduct.stock_status ?? null)
                  : (matchedVariant?.stock_status ?? null);
                if (!stockStatus) return null;
                return (
                  <div className={`public-card p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.24)] dark:shadow-none border-l-4 ${stockStatus === "IN_STOCK" ? "border-l-green-500" : "border-l-amber-500"}`}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Availability
                    </div>
                    <div className={`mt-2 text-sm font-bold ${stockStatus === "IN_STOCK" ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {stockStatus === "IN_STOCK" ? "✓ In Stock (Ready)" : "⚒ Make to Order"}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          <ProductEnquiryHandoffPanel product={displayProduct} dict={dict} />
        </div>

        <PublicProductDescriptionAndSpecs product={displayProduct} />
      </section>
    </>
  );
}
