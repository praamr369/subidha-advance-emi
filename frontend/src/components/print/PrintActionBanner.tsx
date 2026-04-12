"use client";

import { Printer } from "lucide-react";

import ActionButton from "@/components/ui/ActionButton";
import { cn } from "@/lib/utils";

type PrintActionBannerProps = {
  title?: string;
  description?: string;
  buttonLabel?: string;
  className?: string;
};

export default function PrintActionBanner({
  title = "Print-ready copy",
  description = "Use browser print to save a clean paper copy or PDF without dashboard chrome.",
  buttonLabel = "Print / Save PDF",
  className,
}: PrintActionBannerProps) {
  return (
    <section
      className={cn(
        "receipt-print-hide flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3",
        className
      )}
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-600">{description}</p>
      </div>
      <ActionButton
        variant="secondary"
        leftIcon={<Printer className="h-4 w-4" />}
        onClick={() => window.print()}
      >
        {buttonLabel}
      </ActionButton>
    </section>
  );
}
