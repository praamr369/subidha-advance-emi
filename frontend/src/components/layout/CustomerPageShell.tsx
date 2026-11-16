"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  noPad?: boolean;
};

export default function CustomerPageShell({
  title,
  subtitle,
  backHref,
  backLabel,
  actions,
  children,
  className,
  noPad,
}: Props) {
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      {/* Page header */}
      <div className="sticky top-14 z-20 border-b border-border bg-background/95 backdrop-blur-sm px-4 pt-3 pb-3">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-1.5 inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground active:bg-muted/60 touch-manipulation -ml-1"
          >
            <ArrowLeft className="size-4" />
            {backLabel ?? "Back"}
          </Link>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-foreground leading-tight truncate">{title}</h1>
            {subtitle ? (
              <p className="mt-0.5 text-xs font-medium text-muted-foreground leading-relaxed">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0 flex items-center gap-2">{actions}</div> : null}
        </div>
      </div>

      {/* Page content */}
      <div className={cn(noPad ? "" : "px-4 py-4")}>{children}</div>
    </div>
  );
}

/* Stat tile for the mobile summary row */
export function CPageStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const valueColor = {
    default: "text-foreground",
    success: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    danger: "text-red-700 dark:text-red-400",
    info: "text-blue-700 dark:text-blue-400",
  }[tone];

  return (
    <div className="flex-1 min-w-0 rounded-2xl border border-border bg-card p-3.5 shadow-xs">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
      <p className={cn("mt-1 text-lg font-black truncate tracking-tight", valueColor)}>{value}</p>
    </div>
  );
}

/* Row of stat tiles */
export function CPageStats({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto pb-1">{children}</div>;
}

/* Section divider with label */
export function CPageSection({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-4", className)}>
      {title ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          {action ? <div className="text-xs">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/* Mobile pill tab bar */
export function CPageTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { value: T; label: string; count?: number }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            "shrink-0 rounded-full px-4 py-2 min-h-[38px] text-xs font-bold transition active:scale-95 touch-manipulation",
            active === t.value
              ? "bg-primary text-primary-foreground shadow-xs"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
          {t.count !== undefined ? (
            <span className="ml-1 opacity-75">({t.count})</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* Card wrapper for list items */
export function CPageCard({
  children,
  className,
  onClick,
  href,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  href?: string;
}) {
  const base = cn(
    "rounded-2xl border border-border bg-card p-4 shadow-sm transition",
    (onClick ?? href) && "active:bg-muted/40 cursor-pointer hover:shadow-md",
    className
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, "w-full text-left")}>
        {children}
      </button>
    );
  }

  return <div className={base}>{children}</div>;
}
