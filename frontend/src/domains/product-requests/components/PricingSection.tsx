"use client";

import { useMemo } from "react";
import { formatRupee } from "@/lib/utils/currency";

interface PricingSectionProps {
  productName: string;
  basePrice: number;
  monthlyAmount: number;
  onMonthlyAmountChange: (value: string) => void;
  tenure: number;
  onTenureChange: (value: string) => void;
  type: "RENT" | "LEASE" | "DIRECT_SALE";
  minTenure?: number;
}

export default function PricingSection({
  productName,
  basePrice,
  monthlyAmount,
  onMonthlyAmountChange,
  tenure,
  onTenureChange,
  type,
  minTenure = 1,
}: PricingSectionProps) {
  const totalCost = useMemo(() => {
    return (monthlyAmount || 0) * (tenure || 1);
  }, [monthlyAmount, tenure]);

  const isPriceModified = useMemo(() => {
    if (type === "RENT") {
      const defaultMonthly = basePrice / 12;
      return Math.abs(monthlyAmount - defaultMonthly) > 0.01;
    }
    if (type === "LEASE") {
      const defaultMonthly = basePrice / 24;
      return Math.abs(monthlyAmount - defaultMonthly) > 0.01;
    }
    return monthlyAmount !== basePrice;
  }, [monthlyAmount, basePrice, type]);

  const getTypeLabel = () => {
    if (type === "DIRECT_SALE") return "Unit Price";
    if (type === "RENT") return "Monthly Rent Amount";
    return "Monthly Lease Amount";
  };

  const getTenureLabel = () => {
    if (type === "DIRECT_SALE") return "Quantity";
    return "Tenure (months)";
  };

  const showTenure = type !== "DIRECT_SALE";

  return (
    <div className="space-y-4">
      {/* Product Info Card */}
      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Product</div>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">{productName}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Base price: <span className="font-medium text-foreground">{formatRupee(basePrice)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Inputs */}
      <div className={`grid gap-3 ${showTenure ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
        <label className="block space-y-2 text-sm">
          <span className="font-semibold text-foreground">{getTypeLabel()}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={monthlyAmount}
            onChange={(e) => onMonthlyAmountChange(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 font-medium focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {isPriceModified && (
            <div className="text-xs text-amber-600">
              ⚠ Custom price (override applied)
            </div>
          )}
        </label>

        {showTenure && (
          <label className="block space-y-2 text-sm">
            <span className="font-semibold text-foreground">{getTenureLabel()}</span>
            <input
              type="number"
              min={minTenure}
              value={tenure}
              onChange={(e) => onTenureChange(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 font-medium focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        )}
      </div>

      {/* Total Cost Summary */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-primary/10 px-4 py-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {type === "DIRECT_SALE" ? "Unit Price" : "Monthly Amount"}
            </span>
            <span className="font-medium text-foreground">{formatRupee(monthlyAmount || 0)}</span>
          </div>

          {showTenure && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium text-foreground">{tenure} {tenure === 1 ? "month" : "months"}</span>
            </div>
          )}

          <div className="border-t border-border pt-2 flex justify-between">
            <span className="font-bold text-foreground">
              {type === "DIRECT_SALE" ? "Invoice Total" : "Total Cost"}
            </span>
            <span className="text-lg font-bold text-primary">{formatRupee(totalCost)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
