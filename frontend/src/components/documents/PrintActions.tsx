"use client";

import { Printer } from "lucide-react";
import type { ReactNode } from "react";

import ShareActions from "@/components/communications/ShareActions";
import ActionButton from "@/components/ui/ActionButton";
import { cn } from "@/lib/utils";

type PrintSharePayload = {
  title: string;
  message: string;
  url?: string;
  whatsappPhone?: string | null;
  label?: string;
};

export function PrintActions({
  title = "Print-ready Document",
  description = "Use browser print to save a clean paper copy or PDF without dashboard chrome.",
  buttonLabel = "Print / Save PDF",
  onPrint,
  secondaryAction,
  share,
  className,
}: {
  title?: string;
  description?: string;
  buttonLabel?: string;
  onPrint?: () => void;
  secondaryAction?: ReactNode;
  share?: PrintSharePayload;
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
        "receipt-print-hide flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 shadow-sm",
        className
      )}
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {secondaryAction}
        {share ? (
          <ShareActions
            label={share.label}
            title={share.title}
            message={share.message}
            url={share.url}
            whatsappPhone={share.whatsappPhone}
          />
        ) : null}
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
