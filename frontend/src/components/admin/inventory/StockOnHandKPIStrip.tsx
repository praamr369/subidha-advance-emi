"use client";

import React from "react";
import { AlertTriangle, Package, Lock, TrendingDown } from "lucide-react";
import type { StockOnHandKPIS } from "@/services/inventory";

interface StockOnHandKPIStripProps {
  summary: StockOnHandKPIS | null;
  isLoading?: boolean;
}

const StockOnHandKPIStrip: React.FC<StockOnHandKPIStripProps> = ({
  summary,
  isLoading = false,
}) => {
  const formatValue = (value: string) => {
    try {
      return parseFloat(value).toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    } catch {
      return value;
    }
  };

  const formatCurrency = (value: string) => {
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg border bg-white p-4 animate-pulse">
            <div className="h-3 bg-gray-200 rounded w-20 mb-2"></div>
            <div className="h-6 bg-gray-200 rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const isCritical = parseInt(summary.critical_shortage_count.toString()) > 0;

  return (
    <div className="space-y-4">
      {/* Main KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Physical Quantity */}
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-600">Physical Qty</div>
            <Package className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-gray-900">
            {formatValue(summary.total_physical_qty)}
          </div>
          <div className="text-xs text-gray-500 mt-1">units in stock</div>
        </div>

        {/* Reserved Quantity */}
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-600">Reserved Qty</div>
            <Lock className="h-4 w-4 text-orange-500" />
          </div>
          <div className="text-xl font-bold text-gray-900">
            {formatValue(summary.total_reserved_qty)}
          </div>
          <div className="text-xs text-gray-500 mt-1">units held</div>
        </div>

        {/* Available Quantity */}
        <div className="rounded-lg border bg-white p-4 border-green-200 bg-green-50">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-600">Available Qty</div>
            <TrendingDown className="h-4 w-4 text-green-600" />
          </div>
          <div className="text-xl font-bold text-green-700">
            {formatValue(summary.total_available_qty)}
          </div>
          <div className="text-xs text-green-600 mt-1">ready for sale</div>
        </div>

        {/* Critical Shortages */}
        <div
          className={`rounded-lg border p-4 ${
            isCritical ? "bg-red-50 border-red-200" : "bg-white"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-600">Critical</div>
            <AlertTriangle
              className={`h-4 w-4 ${isCritical ? "text-red-600" : "text-gray-400"}`}
            />
          </div>
          <div
            className={`text-xl font-bold ${
              isCritical ? "text-red-700" : "text-gray-900"
            }`}
          >
            {summary.critical_shortage_count}
          </div>
          <div
            className={`text-xs mt-1 ${
              isCritical ? "text-red-600" : "text-gray-500"
            }`}
          >
            SKUs below reorder
          </div>
        </div>

        {/* Total Inventory Value */}
        <div className="rounded-lg border bg-white p-4 border-purple-200 bg-purple-50 md:col-span-1 col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-600">Total Value</div>
            <Package className="h-4 w-4 text-purple-600" />
          </div>
          <div className="text-lg font-bold text-purple-700">
            {formatCurrency(summary.total_value)}
          </div>
          <div className="text-xs text-purple-600 mt-1">inventory value</div>
        </div>
      </div>

      {/* Critical Alert Banner */}
      {isCritical && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900">Critical Stock Alert</h3>
            <p className="text-sm text-red-700 mt-1">
              {summary.critical_shortage_count} SKU
              {summary.critical_shortage_count !== 1 ? "s are" : " is"} below reorder point.
              Review the critical shortages table below.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockOnHandKPIStrip;
