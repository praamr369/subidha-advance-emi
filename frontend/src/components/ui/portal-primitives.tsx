import type { ReactNode } from "react";
import { Inbox, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function PageSection({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "workspace-section-shell surface-panel-elevated rounded-[1.6rem] p-4 sm:p-5",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/75 to-transparent" />
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border/80 pb-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="enterprise-section-title text-base">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-[1.25rem] border border-[color-mix(in_oklab,var(--surface-border-strong)_78%,white_22%)] bg-[linear-gradient(180deg,color-mix(in_oklab,white_98%,var(--surface-muted)_2%),color-mix(in_oklab,var(--surface-card-soft)_82%,var(--surface-muted)_18%))] p-4 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.34)]",
        className
      )}
    >
      <p className="enterprise-eyebrow">{label}</p>
      <div className="enterprise-metric mt-2 text-foreground">{value}</div>
      {detail ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p> : null}
    </article>
  );
}

export function DataToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "workspace-filter-bar flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      {children}
    </div>
  );
}

export function LoadingSkeleton({
  label = "Loading...",
  rows = 3,
  compact = false,
  className,
}: {
  label?: string;
  rows?: number;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("surface-glass rounded-2xl p-4", className)} aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
      {!compact ? (
        <div className="mt-4 grid gap-2">
          {Array.from({ length: Math.max(rows, 1) }).map((_, index) => (
            <div
              key={`loading-row-${index}`}
              className={cn(
                "animate-skeleton-pulse h-2 rounded bg-[var(--surface-muted)]",
                index === rows - 1 ? "w-4/5" : index % 2 === 0 ? "w-full" : "w-11/12"
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PortalEmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface-inset flex flex-col items-center justify-center rounded-[1.5rem] border-dashed px-6 py-10 text-center",
        className
      )}
    >
      <div className="rounded-full border border-[color-mix(in_oklab,var(--surface-border-strong)_78%,white_22%)] bg-[var(--surface-card-elevated)] p-3 text-muted-foreground shadow-[0_12px_32px_-26px_rgba(15,23,42,0.32)]">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      {description ? <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
