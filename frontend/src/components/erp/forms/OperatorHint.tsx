"use client";

import type { ReactNode } from "react";

import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

type OperatorHintProps = {
  title?: string;
  children: ReactNode;
  tone?: "info" | "warning";
  className?: string;
};

export default function OperatorHint({
  title = "Operator hint",
  children,
  tone = "info",
  className,
}: OperatorHintProps) {
  const toneClasses =
    tone === "warning"
      ? "border-amber-600/35 bg-amber-600/10"
      : "border-sky-600/30 bg-sky-600/10";
  const iconClasses = tone === "warning" ? "text-amber-700 dark:text-amber-400" : "text-sky-700 dark:text-sky-400";

  return (
    <div className={cn("rounded-xl border px-4 py-3", toneClasses, className)}>
      <div className="flex items-start gap-3">
        <Info className={cn("mt-0.5 h-4 w-4 shrink-0", iconClasses)} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
        </div>
      </div>
    </div>
  );
}

