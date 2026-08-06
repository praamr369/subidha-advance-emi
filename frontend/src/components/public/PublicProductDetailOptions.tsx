"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import PublicProductVariantSelector from "./PublicProductVariantSelector";
import type { PublicProduct } from "@/services/public";

type PublicProductDetailOptionsProps = {
  product: PublicProduct;
};

export default function PublicProductDetailOptions({ product }: PublicProductDetailOptionsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!product.pim_variants || product.pim_variants.length === 0) return null;

  // Build selected attributes from URL
  const selectedAttributes: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key.startsWith("attr_")) {
      selectedAttributes[key.replace("attr_", "")] = value;
    }
  });

  const handleAttributeSelect = (attributeName: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(`attr_${attributeName}`, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Note: We no longer need to display the local Variant Price delta here
  // because the entire product display (including ProductEnquiryHandoffPanel) 
  // updates globally when a variant matches perfectly via URL params.

  return (
    <div className="mt-4 rounded-[1.5rem] border border-border bg-card p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Available Options</h3>
      <PublicProductVariantSelector
        variants={product.pim_variants}
        selectedAttributes={selectedAttributes}
        onAttributeSelect={handleAttributeSelect}
      />
    </div>
  );
}

