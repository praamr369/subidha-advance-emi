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

  function optionIsAvailable(key: string, option: string) {
    const otherSelections = Object.fromEntries(
      Object.entries(selectedAttributes).filter(([selectedKey]) => selectedKey !== key),
    );
    return variants.some((variant) =>
      Object.entries(otherSelections).every(([selectedKey, value]) =>
        variant.attributes[selectedKey] === value,
      ) && variant.attributes[key] === option,
    );
  }

  return (
    <div className="space-y-6 pt-1">
      {attributeKeys.map((key) => {
        const options = Array.from(attributeValues[key] || []);
        if (options.length === 0) return null;

        return (
          <div key={key} className="space-y-3 border-b border-border/60 pb-5 last:border-b-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-bold text-foreground">
                {key}
              </span>
              {selectedAttributes[key] && (
                <span className="text-xs font-medium text-primary">
                  Selected: {selectedAttributes[key]}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {options.map((option) => {
                const isSelected = selectedAttributes[key] === option;
                const available = optionIsAvailable(key, option);
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
                    disabled={!available}
                    onClick={() => onAttributeSelect(key, isSelected ? "" : option)}
                    aria-pressed={isSelected}
                    className={`inline-flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left text-sm transition-all duration-200 ${
                      isSelected
                        ? "border-primary bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] text-primary ring-1 ring-primary font-bold shadow-sm"
                        : available
                          ? "border-border/70 bg-background text-foreground hover:border-primary/60 hover:bg-muted"
                          : "cursor-not-allowed border-border/40 bg-muted/40 text-muted-foreground/45 line-through"
                    }`}
                  >
                    <span className="line-clamp-2 w-full font-medium">{option}</span>
                    {priceLabel && (
                      <span className={`mt-1 text-[10px] font-normal ${isSelected ? "text-primary/80" : "text-muted-foreground/70"}`}>
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
