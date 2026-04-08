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
        "relative overflow-hidden rounded-[1.75rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-5 shadow-[0_20px_55px_-42px_rgba(15,23,42,0.62)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent" />
      <div className="flex flex-col gap-4 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        {action ? (
          <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
        ) : actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] transition hover:-translate-y-0.5 hover:bg-slate-200"
          >
            {actionLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      <div className={cn("mt-5", contentClassName)}>{children}</div>

      {footer ? (
        <div className="mt-5 border-t border-slate-200/70 pt-4">{footer}</div>
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
        "rounded-2xl border border-white/75 bg-white/70 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur",
        className
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-2 text-sm font-medium leading-6", toneClassName)}>
        {value}
      </div>
    </div>
  );
}
