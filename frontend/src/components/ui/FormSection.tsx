// frontend/src/components/ui/FormSection.tsx
"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ReactNode, useState } from "react";

type FormSectionProps = {
  title?: string;
  description?: string;
  note?: string;
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
  note,
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
    <section className="workspace-section-shell surface-panel-elevated rounded-[1.55rem] shadow-sm">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/75 to-transparent" />
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-4 p-5",
          divider && "border-b border-border"
        )}
      >
        <div>
          {title && <h3 className="enterprise-section-title text-lg">{title}</h3>}
          {description && (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          )}
          {note ? (
            <div className="mt-2 inline-flex max-w-2xl rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2 text-xs font-medium leading-6 text-foreground">
              {note}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {collapsible && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-2 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] hover:text-foreground"
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
