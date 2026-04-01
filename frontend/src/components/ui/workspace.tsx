"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

type WorkspaceSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function WorkspaceSection({
  title,
  description,
  children,
  actionHref,
  actionLabel,
  action,
  footer,
  className,
  contentClassName,
}: WorkspaceSectionProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-sm",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {action ? (
          <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
        ) : actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            {actionLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      <div className={cn("mt-4", contentClassName)}>{children}</div>

      {footer ? <div className="mt-4 border-t border-border pt-4">{footer}</div> : null}
    </section>
  );
}

type DetailItemProps = {
  label: string;
  value: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
};

export function DetailItem({
  label,
  value,
  tone = "default",
  className,
}: DetailItemProps) {
  const toneClassName =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-red-700"
          : tone === "info"
            ? "text-sky-700"
            : "text-foreground";

  return (
    <div className={className}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-sm", toneClassName)}>{value}</div>
    </div>
  );
}
