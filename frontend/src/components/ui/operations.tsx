import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type CommonProps = {
  className?: string;
  children: ReactNode;
};

export function DataTableShell({ className, children }: CommonProps) {
  return <div className={cn("table-surface-frame p-4", className)}>{children}</div>;
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
