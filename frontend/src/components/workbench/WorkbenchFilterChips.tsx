"use client";

import { cn } from "@/lib/utils";

export type WorkbenchFilterChip = {
  key: string;
  label: string;
  count?: number;
};

/**
 * Shared category/status filter chip row for workbench-style list pages.
 * Renders a horizontal set of pill toggles with optional counts; the active
 * chip is highlighted. Used by the CRM workbench and any other operational
 * queue that filters rows by a single category.
 */
export function WorkbenchFilterChips({
  chips,
  active,
  onSelect,
  className,
}: {
  chips: WorkbenchFilterChip[];
  active: string;
  onSelect: (key: string) => void;
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {chips.map((chip) => {
        const isActive = active === chip.key;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onSelect(chip.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            {chip.label}
            {chip.count != null ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold",
                  isActive ? "bg-primary-foreground/20" : "bg-muted"
                )}
              >
                {chip.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
