"use client";

import { CheckCircle, X } from "lucide-react";

import ProductSpecSearch, { type ProductSpecRow } from "@/components/products/ProductSpecSearch";

type PlanType = "EMI" | "RENT" | "LEASE" | "DIRECT_SALE";

export type ProductOption = {
  id: number;
  name: string;
  product_code?: string;
  sku?: string;
  base_price?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  hsn_sac_code?: string;
  unit_of_measure?: string;
  base_specs?: Record<string, string>;
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;
  is_direct_sale_enabled?: boolean;
  lifecycle_status?: string;
  on_hand_qty?: string;
  reserved_qty?: string;
  available_qty?: string;
  stock_status?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "FULLY_RESERVED";
};

type ProductSelectorProps = {
  onSelect: (product: ProductOption) => void;
  onClear?: () => void;
  selected?: ProductOption | null;
  planFilter?: PlanType | null;
  disabled?: boolean;
  placeholder?: string;
};

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** Kept for backwards compatibility with any importer. */
export function normalizeProduct(raw: Record<string, unknown>): ProductOption {
  return {
    id: toNumber(raw.id),
    name: String(raw.name ?? ""),
    product_code: toOptionalString(raw.product_code),
    sku: toOptionalString(raw.sku),
    base_price: toMoneyString(raw.base_price),
    category: toOptionalString(raw.category),
    subcategory: toOptionalString(raw.subcategory),
    brand: toOptionalString(raw.brand),
    hsn_sac_code: toOptionalString(raw.hsn_sac_code),
    unit_of_measure: toOptionalString(raw.unit_of_measure),
    base_specs:
      raw.base_specs && typeof raw.base_specs === "object" && !Array.isArray(raw.base_specs)
        ? (raw.base_specs as Record<string, string>)
        : undefined,
    is_emi_enabled: typeof raw.is_emi_enabled === "boolean" ? raw.is_emi_enabled : undefined,
    is_rent_enabled: typeof raw.is_rent_enabled === "boolean" ? raw.is_rent_enabled : undefined,
    is_lease_enabled: typeof raw.is_lease_enabled === "boolean" ? raw.is_lease_enabled : undefined,
    is_direct_sale_enabled:
      typeof raw.is_direct_sale_enabled === "boolean" ? raw.is_direct_sale_enabled : undefined,
    lifecycle_status: toOptionalString(raw.lifecycle_status),
  };
}

function rowToOption(row: ProductSpecRow): ProductOption {
  const inv = row.inventory_status;
  return {
    id: row.id,
    name: row.name,
    product_code: row.product_code ?? undefined,
    sku: row.sku ?? undefined,
    base_price: toMoneyString(row.base_price),
    category: row.category ?? undefined,
    subcategory: row.subcategory ?? undefined,
    brand: row.brand,
    hsn_sac_code: row.hsn_sac_code,
    unit_of_measure: row.unit_of_measure,
    base_specs: row.base_specs,
    is_emi_enabled: row.is_emi_enabled,
    is_rent_enabled: row.is_rent_enabled,
    is_lease_enabled: row.is_lease_enabled,
    is_direct_sale_enabled: row.is_direct_sale_enabled,
    lifecycle_status: row.lifecycle_status ?? undefined,
    on_hand_qty: inv?.on_hand,
    reserved_qty: inv?.reserved,
    available_qty: inv?.available,
    stock_status: inv ? (inv.is_in_stock ? "IN_STOCK" : "OUT_OF_STOCK") : undefined,
  };
}

/**
 * Product picker used in the subscription (Advance-EMI / Rent / Lease) create flow.
 * Now backed by the shared ProductSpecSearch so it shows the same professional
 * detail as the direct-sale picker (type, stock, price, spec chips, accessories),
 * while keeping the plan-eligibility filter and the selected-product card.
 */
export default function ProductSelector({
  onSelect,
  onClear,
  selected,
  planFilter,
  disabled = false,
  placeholder = "Search product by name, code, SKU, or category…",
}: ProductSelectorProps) {
  if (selected) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">{selected.name}</div>
            <div className="text-xs text-emerald-700 dark:text-emerald-300">
              {selected.product_code ? `${selected.product_code} • ` : ""}₹{selected.base_price}
              {selected.unit_of_measure ? ` • ${selected.unit_of_measure}` : ""}
            </div>
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => onClear?.()}
            className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>
    );
  }

  return (
    <ProductSpecSearch
      placeholder={placeholder}
      disabled={disabled}
      directSaleOnly={planFilter === "DIRECT_SALE"}
      filterRow={(row) => {
        if (row.lifecycle_status === "DISCONTINUED") return false;
        if (planFilter === "EMI") return Boolean(row.is_emi_enabled);
        if (planFilter === "RENT") return Boolean(row.is_rent_enabled);
        if (planFilter === "LEASE") return Boolean(row.is_lease_enabled);
        if (planFilter === "DIRECT_SALE") return Boolean(row.is_direct_sale_enabled);
        return true;
      }}
      onSelect={(row) => onSelect(rowToOption(row))}
    />
  );
}
