"use client";

import { useCallback, useMemo, useState } from "react";
import { getProductRequestOptions, type ProductRequestCustomerOption, type ProductRequestOptions } from "@/services/product-requests";

interface CustomerLinkSectionProps {
  onCustomerSelect: (customerId: string) => void;
  selectedCustomerId?: string;
  isLoading?: boolean;
  snapshotName?: string;
  snapshotPhone?: string;
}

export default function CustomerLinkSection({
  onCustomerSelect,
  selectedCustomerId,
  isLoading = false,
  snapshotName,
  snapshotPhone,
}: CustomerLinkSectionProps) {
  const [customerQuery, setCustomerQuery] = useState("");
  const [options, setOptions] = useState<ProductRequestOptions | null>(null);
  const [searching, setSearching] = useState(false);

  const loadOptions = useCallback(async (query = customerQuery) => {
    setSearching(true);
    try {
      const payload = await getProductRequestOptions("admin", {
        customerQ: query || undefined,
      });
      setOptions(payload);
    } catch (err) {
      console.error("Failed to load customers:", err);
    } finally {
      setSearching(false);
    }
  }, [customerQuery]);

  async function handleSearch() {
    await loadOptions(customerQuery);
  }

  const selectedCustomer = useMemo<ProductRequestCustomerOption | null>(() => {
    if (!options?.customers || !selectedCustomerId) return null;
    return options.customers.find((c) => String(c.id) === selectedCustomerId) ?? null;
  }, [options, selectedCustomerId]);

  return (
    <div className="space-y-4">
      {/* Search Section */}
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-foreground">Search customers</span>
            <input
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSearch();
                }
              }}
              placeholder="Name, phone, email, or username"
              disabled={isLoading}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={isLoading || searching}
            className="mt-6 h-11 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50 transition"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Customer Dropdown */}
        <label className="block space-y-2 text-sm">
          <span className="font-semibold text-foreground">Select customer</span>
          <select
            value={selectedCustomerId || ""}
            onChange={(e) => {
              onCustomerSelect(e.target.value);
            }}
            disabled={isLoading}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          >
            <option value="">Choose customer...</option>
            {(options?.customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.phone}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Snapshot Info */}
      {snapshotName && snapshotPhone && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-blue-600 mb-1">Or use request snapshot</div>
          <div className="text-sm font-medium text-blue-900">{snapshotName}</div>
          <div className="text-sm text-blue-800">{snapshotPhone}</div>
        </div>
      )}

      {/* Selected Customer Display */}
      {selectedCustomer && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase text-emerald-600">Selected Customer</div>
              <div className="mt-1 text-sm font-semibold text-emerald-900">{selectedCustomer.name}</div>
            </div>
            <svg className="h-5 w-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
