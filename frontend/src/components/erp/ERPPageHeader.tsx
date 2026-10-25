"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";

import { cn } from "@/lib/utils";
import { openAdminHelp } from "@/components/admin/help/AdminHelpDrawer";

type ERPPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  helperNote?: string;
  helperTone?: "default" | "info" | "warning";
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export default function ERPPageHeader({
  eyebrow,
  title,
  description,
  helperNote,
  helperTone = "default",
  status,
  actions,
  className,
}: ERPPageHeaderProps) {
  const pathname = usePathname() || "";
  const isAdminRoute = pathname.startsWith("/admin");

  return (
    <div
      className={cn(
        "workspace-header-panel flex flex-col gap-4 rounded-[1.6rem] border border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-card-elevated)_92%,white_8%),color-mix(in_oklab,var(--surface-card-soft)_78%,var(--surface-muted)_22%))] dark:bg-card dark:bg-none p-5 shadow-[0_22px_55px_-46px_rgba(15,23,42,0.38)] md:flex-row md:items-start md:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="enterprise-eyebrow">{eyebrow}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="enterprise-title text-2xl">{title}</h1>
          {status ? <div className="mt-0.5">{status}</div> : null}
          {isAdminRoute ? (
            <button
              type="button"
              onClick={() => openAdminHelp()}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20 transition cursor-pointer"
              title="Open Workflow & Setup Guide (F1)"
            >
              <CircleHelp className="size-3.5" />
              <span>Guide</span>
            </button>
          ) : null}
        </div>
        {description ? (
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            {description.split('. ').map((sentence, idx, arr) => (
              <span key={idx}>
                {sentence}
                {idx < arr.length - 1 ? '. ' : ''}
              </span>
            ))}
          </div>
        ) : null}
        {helperNote ? (
          <div
            className={cn(
              "mt-3 inline-flex max-w-3xl rounded-xl border px-3 py-2 text-xs font-medium leading-6",
              helperTone === "warning"
                ? "border-amber-200/90 bg-amber-50/85 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100"
                : helperTone === "info"
                  ? "border-sky-200/90 bg-sky-50/85 text-sky-900 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-100"
                  : "border-border bg-muted/50 text-foreground"
            )}
          >
            {helperNote}
          </div>
        ) : null}
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2 self-start md:pt-1">{actions}</div>
      ) : null}
    </div>
  );
}

