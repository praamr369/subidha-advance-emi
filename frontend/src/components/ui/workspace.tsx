"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { PageSection, SectionHeader } from "@/components/ui/portal-primitives";
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

function Note({ text, tone }: { text: string; tone: "default" | "warning" | "info" }) {
  return (
    <div
      className={cn(
        "mt-2 inline-flex max-w-3xl rounded-xl border px-3 py-2 text-xs font-medium leading-6",
        tone === "warning"
          ? "border-amber-200/90 bg-amber-50/85 text-amber-900"
          : tone === "info"
            ? "border-sky-200/90 bg-sky-50/85 text-sky-900"
            : "border-border bg-[var(--surface-muted)] text-foreground"
      )}
    >
      {text}
    </div>
  );
}

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
  const computedAction = action
    ? action
    : actionHref && actionLabel
      ? (
          <Link
            href={actionHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border bg-[var(--surface-strong)] px-3.5 py-2 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
          >
            {actionLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )
      : null;

  return (
    <PageSection className={cn("surface-panel relative overflow-hidden rounded-[1.75rem] p-5", className)}>
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/80 to-transparent" />
      <SectionHeader title={title} description={description} actions={computedAction} />
      {note ? <Note text={note} tone={noteTone} /> : null}
      <div className={cn("mt-5", contentClassName)}>{children}</div>
      {footer ? <div className="mt-5 border-t border-border/80 pt-4">{footer}</div> : null}
    </PageSection>
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
      <div className="enterprise-eyebrow">{label}</div>
      <div className={cn("mt-2 text-sm font-medium leading-6", toneClassName)}>{value}</div>
    </div>
  );
}
