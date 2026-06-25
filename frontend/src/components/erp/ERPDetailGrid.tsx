"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ERPDetailGridItem = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
};

type ERPDetailGridProps = {
  items: ReadonlyArray<ERPDetailGridItem>;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
};

export default function ERPDetailGrid({ items, columns = 2, className }: ERPDetailGridProps) {
  if (items.length === 0) return null;

  const gridCols =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
        ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
        : columns === 4
          ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
          : "grid-cols-1 sm:grid-cols-2";

  return (
    <dl
      className={cn(
        "grid gap-3 rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]",
        gridCols,
        className
      )}
    >
      {items.map((item, index) => (
        <div
          key={`detail-${index}`}
          className={cn(
            "rounded-xl border border-border bg-muted/40 p-3",
            item.className
          )}
        >
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm font-semibold leading-6 text-foreground">{item.value}</dd>
          {item.hint ? <dd className="mt-1 text-sm leading-6 text-muted-foreground">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

