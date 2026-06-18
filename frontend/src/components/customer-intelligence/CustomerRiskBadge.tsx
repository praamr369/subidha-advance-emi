"use client";

import type { CustomerRiskBand } from "@/services/customer-intelligence";

type Props = {
  band: CustomerRiskBand;
  score?: number;
  size?: "sm" | "md";
};

const BAND_CLASSES: Record<CustomerRiskBand, string> = {
  LOW: "border-emerald-200 bg-emerald-50 text-emerald-800",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-800",
  HIGH: "border-red-200 bg-red-50 text-red-800",
  BLOCKED: "border-red-400 bg-red-100 text-red-900",
};

export function CustomerRiskBadge({ band, score, size = "md" }: Props) {
  const classes = BAND_CLASSES[band] ?? "border-border bg-muted text-foreground";
  const padClass = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  const label = score != null ? `${band} · ${score}` : band;

  return (
    <span
      className={`inline-flex rounded-full border font-semibold ${padClass} ${classes}`}
      data-testid="customer-risk-badge"
      data-band={band}
    >
      {label}
    </span>
  );
}
