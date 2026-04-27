"use client";

import { cn } from "@/lib/utils";

export function SeverityBadge({ severity }: { severity: string }) {
  const tone = severity?.toUpperCase() || "LOW";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
        tone === "HIGH"
          ? "bg-red-100 text-red-800"
          : tone === "MEDIUM"
            ? "bg-amber-100 text-amber-800"
            : "bg-emerald-100 text-emerald-800"
      )}
    >
      {tone}
    </span>
  );
}
