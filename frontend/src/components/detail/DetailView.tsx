import type { ReactNode } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "danger" | "info";

function toneClassName(tone: Tone): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "danger":
      return "border-red-200 bg-red-50 text-red-800";
    case "info":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "default":
    default:
      return "border-border bg-muted text-foreground";
  }
}

export type DetailMetaItem = {
  label: string;
  value: ReactNode;
  tone?: Tone;
};

export function SafeValue({
  value,
  fallback = "—",
}: {
  value: string | number | null | undefined;
  fallback?: string;
}) {
  if (value === null || value === undefined) return <>{fallback}</>;
  if (typeof value === "number") {
    return <>{Number.isFinite(value) ? value : fallback}</>;
  }

  const trimmed = value.trim();
  return <>{trimmed || fallback}</>;
}

export function StatusChip({
  label,
  tone = "default",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em]",
        toneClassName(tone)
      )}
    >
      {label}
    </span>
  );
}

export function DetailSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", className)}>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function DetailMetaGrid({
  items,
  columns = "md:grid-cols-2 xl:grid-cols-4",
}: {
  items: DetailMetaItem[];
  columns?: string;
}) {
  const visibleItems = items.filter((item) => item.value !== null && item.value !== undefined);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className={cn("grid gap-3", columns)}>
      {visibleItems.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {item.label}
          </div>
          <div
            className={cn(
              "mt-2 text-sm font-medium",
              item.tone === "success"
                ? "text-emerald-700"
                : item.tone === "warning"
                  ? "text-amber-700"
                  : item.tone === "danger"
                    ? "text-red-700"
                    : item.tone === "info"
                      ? "text-sky-700"
                      : "text-foreground"
            )}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MoneySummary({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; tone?: Tone }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-background px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {item.label}
          </div>
          <div
            className={cn(
              "mt-1.5 text-sm font-semibold",
              item.tone === "success"
                ? "text-emerald-700"
                : item.tone === "warning"
                  ? "text-amber-700"
                  : item.tone === "danger"
                    ? "text-red-700"
                    : "text-foreground"
            )}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActionStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}

export function EmptyDetailState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return <EmptyState title={title} description={description} />;
}
