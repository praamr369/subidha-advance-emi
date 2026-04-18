"use client";

import { Printer } from "lucide-react";
import type { ReactNode } from "react";

import ActionButton from "@/components/ui/ActionButton";
import { cn } from "@/lib/utils";

export function PrintActions({
  title = "Print-ready Document",
  description = "Use browser print to save a clean paper copy or PDF without dashboard chrome.",
  buttonLabel = "Print / Save PDF",
  onPrint,
  secondaryAction,
  className,
}: {
  title?: string;
  description?: string;
  buttonLabel?: string;
  onPrint?: () => void;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  function handlePrint() {
    if (onPrint) {
      onPrint();
      return;
    }

    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <section
      className={cn(
        "receipt-print-hide flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm",
        className
      )}
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-600">{description}</p>
      </div>

      <div className="flex items-center gap-2">
        {secondaryAction}
        <ActionButton
          variant="primary"
          leftIcon={<Printer className="h-4 w-4" />}
          onClick={handlePrint}
        >
          {buttonLabel}
        </ActionButton>
      </div>
    </section>
  );
}

