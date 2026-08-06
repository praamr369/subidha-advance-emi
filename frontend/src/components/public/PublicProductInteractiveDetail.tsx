"use client";

import { useState, useEffect } from "react";
import PublicProductDetailMedia from "./PublicProductDetailMedia";
import PublicProductVariantSelector from "./PublicProductVariantSelector";
import ProductEnquiryHandoffPanel from "./ProductEnquiryHandoffPanel";
import PublicProductDescriptionAndSpecs from "./PublicProductDescriptionAndSpecs";
import type { PublicProduct } from "@/services/public";

type PublicProductInteractiveDetailProps = {
  initialProduct: PublicProduct;
  initialSelectedAttributes: Record<string, string>;
  dict: any;
};

export default function PublicProductInteractiveDetail({
  initialProduct,
  initialSelectedAttributes,
  dict,
}: PublicProductInteractiveDetailProps) {
  const [selectedAttributes, setSelectedAttributes] = useState(initialSelectedAttributes);

  // Sync state if URL changes externally (e.g. back/forward navigation)
  useEffect(() => {
    setSelectedAttributes(initialSelectedAttributes);
  }, [initialSelectedAttributes]);

  const handleAttributeSelect = (attributeName: string, value: string) => {
    const newAttributes = { ...selectedAttributes, [attributeName]: value };
    setSelectedAttributes(newAttributes);

    // Update URL instantly without server roundtrip
    const url = new URL(window.location.href);
    url.searchParams.set(`attr_${attributeName}`, value);
    window.history.replaceState(null, "", url.toString());
  };

  let matchedVariant = null;
  if (
    initialProduct.pim_variants &&
    initialProduct.pim_variants.length > 0 &&
    Object.keys(selectedAttributes).length > 0
  ) {
    const matchingVariants = initialProduct.pim_variants.filter((v) => {
      for (const [key, val] of Object.entries(selectedAttributes)) {
        if (v.attributes[key] !== val) {
          return false;
        }
      }
      return true;
    });

    if (matchingVariants.length > 0) {
      matchingVariants.sort((a, b) => Number(a.price) - Number(b.price));
      matchedVariant = matchingVariants[0];
    }
  }

  const displayProduct = matchedVariant
    ? {
        ...initialProduct,
        base_price: matchedVariant.price,
        product_code: matchedVariant.sku,
        image: matchedVariant.image || initialProduct.image,
        stock_status: matchedVariant.stock_status,
      }
    : initialProduct;

  const factRows = [
    { label: "Product code", value: displayProduct.product_code || "Unassigned" },
    { label: "Category", value: displayProduct.category || "Not classified" },
    { label: "Subcategory", value: displayProduct.subcategory || "Not classified" },
    {
      label: "Media state",
      value:
        Boolean(displayProduct.image) ||
        (displayProduct.gallery_images?.length ?? 0) > 0 ||
        Boolean(displayProduct.video)
          ? "Uploaded product media"
          : "Media pending",
    },
  ];

  return (
    <>
      <section className="public-surface relative overflow-hidden p-6 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/70 to-transparent" />
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-4">
            <PublicProductDetailMedia
              product={displayProduct}
              carouselAriaLabel={dict.common.mediaCarousel.productGalleryLabel}
              prevLabel={dict.common.mediaCarousel.previousSlide}
              nextLabel={dict.common.mediaCarousel.nextSlide}
            />
            {initialProduct.pim_variants && initialProduct.pim_variants.length > 0 && (
              <div className="mt-4 rounded-[1.5rem] border border-border bg-card p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold text-foreground">Available Options</h3>
                <PublicProductVariantSelector
                  variants={initialProduct.pim_variants}
                  selectedAttributes={selectedAttributes}
                  onAttributeSelect={handleAttributeSelect}
                />
              </div>
            )}
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
              
              {matchedVariant && matchedVariant.stock_status && (
                <div className={`public-card p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.24)] dark:shadow-none border-l-4 ${matchedVariant.stock_status === 'IN_STOCK' ? 'border-l-green-500' : 'border-l-amber-500'}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Availability
                  </div>
                  <div className={`mt-2 text-sm font-bold ${matchedVariant.stock_status === 'IN_STOCK' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {matchedVariant.stock_status === 'IN_STOCK' ? '✓ In Stock (Ready)' : '⚒ Make to Order'}
                  </div>
                </div>
              )}
            </div>
          </div>

          <ProductEnquiryHandoffPanel product={displayProduct} dict={dict} />
        </div>

        <PublicProductDescriptionAndSpecs product={displayProduct} />
      </section>
    </>
  );
}
