"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type FormImpactPanelProps = {
  title?: string;
  items: ReactNode[];
  tone?: "info" | "warning";
  className?: string;
};

export default function FormImpactPanel({
  title = "After you save",
  items,
  tone = "info",
  className,
}: FormImpactPanelProps) {
  const toneClasses =
    tone === "warning"
      ? "border-amber-600/35 bg-amber-600/10"
      : "border-sky-600/30 bg-sky-600/10";

  return (
    <div className={cn("rounded-2xl border px-4 py-3 text-sm", toneClasses, className)}>
      <div className="font-semibold text-foreground">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
        {items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

