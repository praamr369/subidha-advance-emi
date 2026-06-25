"use client";

import type { ReactNode } from "react";

import { DataToolbar } from "@/components/ui/portal-primitives";
import { cn } from "@/lib/utils";

type ERPDataToolbarProps = {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export default function ERPDataToolbar({ left, right, className }: ERPDataToolbarProps) {
  if (!left && !right) return null;

  return (
    <DataToolbar
      className={cn(
        "rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_88%,var(--surface-muted)_12%)] shadow-[inset_0_1px_0_var(--hairline-shine)]",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {left ? <div className="min-w-0 flex-1">{left}</div> : <div className="min-w-0 flex-1" />}
        {right ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{right}</div> : null}
      </div>
    </DataToolbar>
  );
}

