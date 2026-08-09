"use client";

import { useMemo } from "react";
import { formatCurrency } from "@/lib/format";
import type { PublicProduct } from "@/services/public";

type Variant = NonNullable<PublicProduct["pim_variants"]>[0];

type PublicProductVariantSelectorProps = {
  variants: Variant[];
  selectedAttributes: Record<string, string>;
  onAttributeSelect: (attributeName: string, value: string) => void;
};

export default function PublicProductVariantSelector({
  variants,
  selectedAttributes,
  onAttributeSelect,
}: PublicProductVariantSelectorProps) {
  const { attributeKeys, attributeValues } = useMemo(() => {
    const keys = new Set<string>();
    const values: Record<string, Set<string>> = {};

    for (const variant of variants) {
      for (const [key, value] of Object.entries(variant.attributes)) {
        keys.add(key);
        if (!values[key]) values[key] = new Set();
        values[key].add(value);
      }
    }

    return {
      attributeKeys: Array.from(keys),
      attributeValues: values,
    };
  }, [variants]);

  if (attributeKeys.length === 0) return null;

  return (
    <div className="space-y-5 pt-1">
      {attributeKeys.map((key) => {
        const options = Array.from(attributeValues[key] || []);
        if (options.length === 0) return null;

        return (
          <div key={key} className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {key}
            </div>
            <div className="flex flex-wrap gap-2">
              {options.map((option) => {
                const isSelected = selectedAttributes[key] === option;
                
                // Calculate price delta if this option is selected (keeping others same)
                let priceDeltaElement = null;
                if (!isSelected) {
                  const currentVariant = variants.find((v) => {
                    for (const [k, val] of Object.entries(selectedAttributes)) {
                      if (v.attributes[k] !== val) return false;
                    }
                    return true;
                  });
                  const potentialAttributes = { ...selectedAttributes, [key]: option };
                  const potentialVariant = variants.find((v) => {
                    for (const [k, val] of Object.entries(potentialAttributes)) {
                      if (v.attributes[k] !== val) return false;
                    }
                    return true;
                  });

                  if (currentVariant && potentialVariant) {
                    const diff = Number(potentialVariant.price) - Number(currentVariant.price);
                    if (diff > 0) {
                      priceDeltaElement = <span className="ml-1.5 text-[10px] opacity-70">(+{formatCurrency(diff.toString())})</span>;
                    } else if (diff < 0) {
                      priceDeltaElement = <span className="ml-1.5 text-[10px] opacity-70">(-{formatCurrency(Math.abs(diff).toString())})</span>;
                    }
                  }
                }

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onAttributeSelect(key, option)}
                    className={`inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm transition-all duration-200 ${
                      isSelected
                        ? "border-primary bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] text-primary ring-1 ring-primary font-bold shadow-[0_0_16px_-3px_color-mix(in_oklab,var(--primary)_40%,transparent)]"
                        : "border-border/70 bg-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {option}
                    {priceDeltaElement}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
