"use client";

import { RefreshCw, Search } from "lucide-react";
import ActionButton from "@/components/ui/ActionButton";

export type FilterOption = {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

type ProfileToolbarProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  loading?: boolean;
  filters?: FilterOption[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  onApply?: () => void;
  onReset?: () => void;
  actions?: React.ReactNode;
};

export function ProfileToolbar({
  searchValue,
  onSearchChange,
  onRefresh,
  refreshing = false,
  loading = false,
  filters = [],
  filterValues = {},
  onFilterChange,
  onApply,
  onReset,
  actions,
}: ProfileToolbarProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <ActionButton
          variant="outline"
          onClick={onRefresh}
          disabled={refreshing || loading}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </ActionButton>
        {actions}
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search records..."
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring"
          />
        </div>

        {filters.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filters.map((filter) => (
              <select
                key={filter.key}
                value={filterValues[filter.key] || ""}
                onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">{filter.label}</option>
                {filter.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ))}
          </div>
        )}

        {(onApply || onReset) && (
          <div className="flex flex-wrap gap-2">
            {onApply && (
              <ActionButton variant="primary" onClick={onApply}>
                Apply Filters
              </ActionButton>
            )}
            {onReset && (
              <ActionButton variant="outline" onClick={onReset}>
                Reset
              </ActionButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
