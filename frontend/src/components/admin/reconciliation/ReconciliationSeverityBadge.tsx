"use client";

import { cn } from "@/lib/utils";

export default function ReconciliationSeverityBadge({ severity }: { severity?: string | null }) {
  const value = (severity || "").toUpperCase();
  const tone =
    value === "CRITICAL"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : value === "HIGH"
        ? "border-[color-mix(in_oklab,var(--warning)_35%,var(--border)_65%)] bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] text-foreground"
        : value === "MEDIUM"
          ? "border-border bg-muted/50 text-foreground"
          : "border-border bg-muted/50 text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.01em]",
        tone
      )}
    >
      {value || "UNKNOWN"}
    </span>
  );
}

