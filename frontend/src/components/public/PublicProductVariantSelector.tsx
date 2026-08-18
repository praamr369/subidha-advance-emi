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

  // Soft match helper — same logic as in PublicProductInteractiveDetail
  function softMatch(v: Variant, attrs: Record<string, string>) {
    for (const [key, val] of Object.entries(attrs)) {
      if (key in v.attributes && v.attributes[key] !== val) return false;
    }
    return true;
  }

  // Best variant for a given attribute map (soft → strict fallback)
  function bestVariant(attrs: Record<string, string>): Variant | null {
    // strict
    let match = variants.find((v) =>
      Object.entries(attrs).every(([k, val]) => v.attributes[k] === val)
    );
    // soft fallback
    if (!match) match = variants.find((v) => softMatch(v, attrs));
    return match ?? null;
  }

  if (attributeKeys.length === 0) return null;

  const currentVariant = bestVariant(selectedAttributes);

  return (
    <div className="space-y-5 pt-1">
      {attributeKeys.map((key) => {
        const options = Array.from(attributeValues[key] || []);
        if (options.length === 0) return null;

        return (
          <div key={key} className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {key}
              </span>
              {selectedAttributes[key] && (
                <span className="text-xs font-medium text-foreground">
                  — {selectedAttributes[key]}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {options.map((option) => {
                const isSelected = selectedAttributes[key] === option;
                const potentialAttrs = { ...selectedAttributes, [key]: option };
                const potentialVariant = bestVariant(potentialAttrs);

                // Price badge: show absolute price on each chip
                let priceLabel: string | null = null;
                if (potentialVariant) {
                  if (isSelected) {
                    priceLabel = formatCurrency(potentialVariant.price);
                  } else if (currentVariant) {
                    const diff = Number(potentialVariant.price) - Number(currentVariant.price);
                    if (diff > 0) priceLabel = `+${formatCurrency(diff.toString())}`;
                    else if (diff < 0) priceLabel = `-${formatCurrency(Math.abs(diff).toString())}`;
                    else priceLabel = formatCurrency(potentialVariant.price);
                  } else {
                    priceLabel = formatCurrency(potentialVariant.price);
                  }
                }

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onAttributeSelect(key, option)}
                    className={`inline-flex flex-col items-center justify-center rounded-xl border px-4 py-2 text-sm transition-all duration-200 min-w-[72px] ${
                      isSelected
                        ? "border-primary bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] text-primary ring-1 ring-primary font-bold shadow-[0_0_16px_-3px_color-mix(in_oklab,var(--primary)_40%,transparent)]"
                        : "border-border/70 bg-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span>{option}</span>
                    {priceLabel && (
                      <span className={`text-[10px] mt-0.5 font-normal ${isSelected ? "text-primary/80" : "text-muted-foreground/70"}`}>
                        {priceLabel}
                      </span>
                    )}
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
