"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export default function DocumentActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 shadow-[inset_0_1px_0_var(--hairline-shine)]",
        className
      )}
    >
      {children}
    </div>
  );
}

