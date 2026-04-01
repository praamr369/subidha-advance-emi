// frontend/src/components/ui/FormSection.tsx
"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ReactNode, useState } from "react";

type FormSectionProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
  collapsible?: boolean;
  defaultOpen?: boolean;
  actions?: ReactNode;
  divider?: boolean;
};

export default function FormSection({
  title,
  description,
  children,
  columns = 2,
  collapsible = false,
  defaultOpen = true,
  actions,
  divider = true,
}: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-4 p-5",
          divider && "border-b border-border"
        )}
      >
        <div>
          {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {collapsible && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
      {(!collapsible || open) && (
        <div className={cn("grid gap-5 p-5", gridCols[columns])}>{children}</div>
      )}
    </section>
  );
}