import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type FilterBarProps = {
  children: ReactNode;
  className?: string;
  /** Accessible label for the filter group (e.g. "Search and filters") */
  "aria-label"?: string;
};

/**
 * Composable filter row: pairs with `TableToolbar` / `DataToolbar` for consistent spacing.
 */
export default function FilterBar({ children, className, "aria-label": ariaLabel = "Filters" }: FilterBarProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3",
        className
      )}
    >
      {children}
    </div>
  );
}
