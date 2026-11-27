"use client";

import React from "react";
import { AlertTriangle, Boxes, CheckCircle2, Lock, Package } from "lucide-react";
import type { StockOnHandFilteredSummary, StockOnHandKPIS } from "@/services/inventory";

interface StockOnHandKPIStripProps {
  summary: StockOnHandKPIS | null;
  filteredSummary?: StockOnHandFilteredSummary | null;
  hasActiveFilter?: boolean;
  isLoading?: boolean;
}

const StockOnHandKPIStrip: React.FC<StockOnHandKPIStripProps> = ({
  summary,
  filteredSummary,
  hasActiveFilter = false,
  isLoading = false,
}) => {
  const formatValue = (value: string | undefined) => {
    if (!value) return "0";
    try {
      return parseFloat(value).toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    } catch {
      return value;
    }
  };

  const formatCurrency = (value: string | undefined) => {
    if (!value) return "₹0";
    try {
      return `₹${parseFloat(value).toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`;
    } catch {
      return value;
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse">
            <div className="h-3 bg-muted rounded w-20 mb-2" />
            <div className="h-6 bg-muted rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  const activeData = hasActiveFilter && filteredSummary ? filteredSummary : null;
  if (!summary && !activeData) return null;

  const physicalQty = activeData ? activeData.total_physical_qty : summary?.total_physical_qty;
  const reservedQty = activeData ? activeData.total_reserved_qty : summary?.total_reserved_qty;
  const availableQty = activeData ? activeData.total_available_qty : summary?.total_available_qty;
  const totalValue = activeData ? activeData.total_value : summary?.total_value;
  const criticalCount = activeData
    ? activeData.low_stock_count + activeData.out_of_stock_count
    : (summary?.critical_shortage_count ?? 0);
  const isCritical = criticalCount > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Physical Quantity */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {activeData ? "Filtered Physical" : "Physical SOH"}
            </span>
            <Package className="h-4 w-4 text-sky-500" />
          </div>
          <div className="text-xl font-bold text-foreground font-mono tabular-nums">
            {formatValue(physicalQty)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {activeData ? `${activeData.total_skus} matching SKUs` : "units in stock"}
          </div>
        </div>

        {/* Reserved Quantity */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reserved (Held)
            </span>
            <Lock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            {formatValue(reservedQty)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">committed soft holds</div>
        </div>

        {/* Available Quantity */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Available (ATP)
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 font-mono tabular-nums">
            {formatValue(availableQty)}
          </div>
          <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
            {activeData ? `${activeData.in_stock_count} SKUs healthy` : "ready for sale / delivery"}
          </div>
        </div>

        {/* Critical / Attention */}
        <div
          className={`rounded-xl border p-4 shadow-2xs ${
            isCritical
              ? "border-rose-500/30 bg-rose-500/10"
              : "border-border bg-card"
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {activeData ? "Out / Low Stock" : "Below Reorder"}
            </span>
            <AlertTriangle
              className={`h-4 w-4 ${isCritical ? "text-rose-500" : "text-muted-foreground"}`}
            />
          </div>
          <div
            className={`text-xl font-bold font-mono tabular-nums ${
              isCritical ? "text-rose-600 dark:text-rose-400" : "text-foreground"
            }`}
          >
            {criticalCount}
          </div>
          <div
            className={`text-[11px] mt-0.5 ${
              isCritical ? "text-rose-600/80 dark:text-rose-400/80" : "text-muted-foreground"
            }`}
          >
            {activeData
              ? `${activeData.out_of_stock_count} out · ${activeData.low_stock_count} low`
              : "SKUs needing attention"}
          </div>
        </div>

        {/* Total Inventory Value */}
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 shadow-2xs md:col-span-1 col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
              {activeData ? "Filtered Value" : "Total Stock Value"}
            </span>
            <Boxes className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="text-xl font-bold text-violet-700 dark:text-violet-300 font-mono tabular-nums">
            {formatCurrency(totalValue)}
          </div>
          <div className="text-[11px] text-violet-700/80 dark:text-violet-400/80 mt-0.5">
            at standard / avg cost
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockOnHandKPIStrip;
