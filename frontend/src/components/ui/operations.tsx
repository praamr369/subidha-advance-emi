import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type CommonProps = {
  className?: string;
  children: ReactNode;
};

export function DataTableShell({ className, children }: CommonProps) {
  return <div className={cn("table-surface-frame p-4", className)}>{children}</div>;
}

export function MobileSafeTable({ className, children }: CommonProps) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-[var(--surface-card-elevated)]", className)}>
      {children}
    </div>
  );
}

export function FormSection({
  className,
  title,
  description,
  children,
}: CommonProps & { title: string; description?: string }) {
  return (
    <section className={cn("surface-panel rounded-2xl p-4", className)}>
      <div className="border-b border-border/80 pb-3">
        <h3 className="enterprise-section-title">{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function KpiCard({
  className,
  label,
  value,
  helper,
}: {
  className?: string;
  label: string;
  value: ReactNode;
  helper?: ReactNode;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border border-[color-mix(in_oklab,var(--surface-border-strong)_80%,white_20%)] bg-[var(--surface-card-elevated)] p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.34)]",
        className
      )}
    >
      <p className="enterprise-eyebrow">{label}</p>
      <p className="enterprise-metric mt-2">{value}</p>
      {helper ? <p className="mt-2 text-xs text-muted-foreground">{helper}</p> : null}
    </article>
  );
}

export function WorkflowCard({
  className,
  title,
  description,
  action,
}: {
  className?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("surface-accent rounded-2xl p-4", className)}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function QuickActionGrid({ className, children }: CommonProps) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

export function DetailPanel({
  className,
  title,
  description,
  children,
}: CommonProps & { title: string; description?: string }) {
  return (
    <section className={cn("surface-panel rounded-2xl p-4", className)}>
      <div className="border-b border-border/80 pb-3">
        <h3 className="enterprise-section-title">{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Timeline({
  className,
  title,
  children,
}: CommonProps & { title?: string }) {
  return (
    <section className={cn("surface-inset rounded-2xl p-4", className)}>
      {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
      <div className={cn("mt-3 grid gap-2", title ? "" : "mt-0")}>{children}</div>
    </section>
  );
}

type MetricStripItem = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  href?: string;
};

export function MetricStrip({
  className,
  items,
}: {
  className?: string;
  items: MetricStripItem[];
}) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-6", className)}>
      {items.map((item) => {
        const body = (
          <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-base font-semibold text-foreground">{item.value}</p>
            {item.helper ? <p className="text-xs text-muted-foreground">{item.helper}</p> : null}
          </div>
        );
        return item.href ? (
          <Link key={item.label} href={item.href} className="block transition hover:-translate-y-0.5">
            {body}
          </Link>
        ) : (
          <div key={item.label}>{body}</div>
        );
      })}
    </div>
  );
}

type QueueRow = {
  title: string;
  count: ReactNode;
  amount?: ReactNode;
  helper?: ReactNode;
  route?: string;
  urgency?: "quiet" | "normal" | "high";
};

export function QueueList({ className, rows }: { className?: string; rows: QueueRow[] }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card", className)}>
      {rows.map((row, idx) => {
        const rowBody = (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{row.title}</p>
              {row.helper ? <p className="text-xs text-muted-foreground">{row.helper}</p> : null}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{row.count}</p>
              {row.amount ? <p className="text-xs text-muted-foreground">{row.amount}</p> : null}
            </div>
          </div>
        );
        return (
          <div key={`${row.title}-${idx}`} className={cn(idx > 0 ? "border-t border-border/70" : "")}>
            {row.route ? (
              <Link href={row.route} className="block transition hover:bg-[var(--surface-muted)]">
                {rowBody}
              </Link>
            ) : (
              rowBody
            )}
          </div>
        );
      })}
    </div>
  );
}

type LedgerRow = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  route?: string;
};

export function LedgerSummary({ className, rows }: { className?: string; rows: LedgerRow[] }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-2", className)}>
      {rows.map((row) => {
        const content = (
          <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition hover:bg-[var(--surface-muted)]">
            <div>
              <p className="text-sm font-medium text-foreground">{row.label}</p>
              {row.helper ? <p className="text-xs text-muted-foreground">{row.helper}</p> : null}
            </div>
            <p className="text-sm font-semibold text-foreground">{row.value}</p>
          </div>
        );
        return row.route ? (
          <Link key={row.label} href={row.route} className="block">
            {content}
          </Link>
        ) : (
          <div key={row.label}>{content}</div>
        );
      })}
    </div>
  );
}

type WorkflowLaneStep = {
  label: string;
  value?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
};

export function WorkflowLane({
  className,
  title,
  steps,
}: {
  className?: string;
  title: string;
  steps: WorkflowLaneStep[];
}) {
  const toneClass = (tone: WorkflowLaneStep["tone"]) => {
    if (tone === "success") return "chip-tone-success";
    if (tone === "warning") return "chip-tone-warning";
    if (tone === "danger") return "chip-tone-danger";
    return "border border-border bg-[var(--surface-card-elevated)] text-foreground";
  };

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-3", className)}>
      <h3 className="px-1 text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {steps.map((step) => (
          <div
            key={step.label}
            className={cn("min-w-[11rem] rounded-xl px-3 py-2", toneClass(step.tone))}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide">{step.label}</p>
            {step.value ? <p className="mt-1 text-sm font-semibold">{step.value}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

type ExceptionRow = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  route?: string;
};

export function ExceptionPanel({
  className,
  title,
  rows,
}: {
  className?: string;
  title: string;
  rows: ExceptionRow[];
}) {
  return (
    <section className={cn("rounded-2xl border border-red-100 bg-red-50/60 p-3", className)}>
      <h3 className="px-1 text-sm font-semibold text-red-900">{title}</h3>
      <div className="mt-2 space-y-2">
        {rows.map((row) => {
          const content = (
            <div className="rounded-xl border border-red-100 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-red-900">{row.label}</p>
                <p className="text-sm font-semibold text-red-900">{row.value}</p>
              </div>
              {row.helper ? <p className="mt-1 text-xs text-red-700">{row.helper}</p> : null}
            </div>
          );
          return row.route ? (
            <Link key={row.label} href={row.route} className="block">
              {content}
            </Link>
          ) : (
            <div key={row.label}>{content}</div>
          );
        })}
      </div>
    </section>
  );
}

type TimelineEntry = {
  label: string;
  detail?: ReactNode;
  time?: ReactNode;
  route?: string;
};

export function ActivityTimeline({
  className,
  title,
  entries,
  emptyLabel = "No recent activity returned by the server.",
}: {
  className?: string;
  title: string;
  entries: TimelineEntry[];
  emptyLabel?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-3", className)}>
      <h3 className="px-1 text-sm font-semibold text-foreground">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-2 px-1 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {entries.map((entry) => {
            const content = (
              <div className="rounded-xl border border-border/70 bg-[var(--surface-card-elevated)] px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{entry.label}</p>
                  {entry.time ? <p className="text-xs text-muted-foreground">{entry.time}</p> : null}
                </div>
                {entry.detail ? <p className="mt-1 text-xs text-muted-foreground">{entry.detail}</p> : null}
              </div>
            );
            return entry.route ? (
              <Link key={`${entry.label}-${entry.time ?? ""}`} href={entry.route} className="block">
                {content}
              </Link>
            ) : (
              <div key={`${entry.label}-${entry.time ?? ""}`}>{content}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}
