// frontend/src/components/ui/PageHeader.tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  helperNote?: string;
  helperTone?: "default" | "info" | "warning";
  actions?: ReactNode;
  className?: string;
};

export default function PageHeader({
  eyebrow,
  title,
  description,
  helperNote,
  helperTone = "default",
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "surface-panel-elevated flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm md:flex-row md:items-start md:justify-between",
        className
      )}
    >
      <div>
        {eyebrow ? <p className="enterprise-eyebrow">{eyebrow}</p> : null}
        <h1 className="enterprise-title text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        )}
        {helperNote ? (
          <div
            className={cn(
              "mt-3 inline-flex max-w-3xl rounded-xl border px-3 py-2 text-xs font-medium leading-6",
              helperTone === "warning"
                ? "border-amber-200/90 bg-amber-50/85 text-amber-900"
                : helperTone === "info"
                  ? "border-sky-200/90 bg-sky-50/85 text-sky-900"
                  : "border-border bg-[var(--surface-muted)] text-foreground"
            )}
          >
            {helperNote}
          </div>
        ) : null}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          {actions}
        </div>
      )}
    </div>
  );
}
