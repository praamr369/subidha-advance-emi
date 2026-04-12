"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

type WorkspaceSectionProps = {
  title: string;
  description?: string;
  note?: string;
  noteTone?: "default" | "warning" | "info";
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
  note,
  noteTone = "default",
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
        "surface-panel relative overflow-hidden rounded-[1.75rem] border border-border bg-card p-5 shadow-sm",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/80 to-transparent" />
      <div className="flex flex-col gap-4 border-b border-border/80 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="enterprise-section-title text-base">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
          {note ? (
            <div
              className={cn(
                "mt-2 inline-flex max-w-3xl rounded-xl border px-3 py-2 text-xs font-medium leading-6",
                noteTone === "warning"
                  ? "border-amber-200/90 bg-amber-50/85 text-amber-900"
                  : noteTone === "info"
                    ? "border-sky-200/90 bg-sky-50/85 text-sky-900"
                    : "border-border bg-[var(--surface-muted)] text-foreground"
              )}
            >
              {note}
            </div>
          ) : null}
        </div>

        {action ? (
          <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
        ) : actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border bg-[var(--surface-strong)] px-3.5 py-2 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
          >
            {actionLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      <div className={cn("mt-5", contentClassName)}>{children}</div>

      {footer ? (
        <div className="mt-5 border-t border-border/80 pt-4">{footer}</div>
      ) : null}
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
    <div
      className={cn(
        "rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.28)]",
        className
      )}
    >
      <div className="enterprise-eyebrow">
        {label}
      </div>
      <div className={cn("mt-2 text-sm font-medium leading-6", toneClassName)}>
        {value}
      </div>
    </div>
  );
}
