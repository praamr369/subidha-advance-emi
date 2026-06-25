"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

type ERPAuditNoteProps = {
  title?: string;
  tone?: "default" | "info" | "warning";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function ERPAuditNote({
  title = "Audit note",
  tone = "default",
  icon,
  children,
  className,
}: ERPAuditNoteProps) {
  return (
    <section
      className={cn(
        "rounded-[1.4rem] border p-4 text-sm shadow-[0_18px_45px_-38px_rgba(15,23,42,0.34)]",
        tone === "warning"
          ? "border-amber-200/90 bg-amber-50/75 text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100"
          : tone === "info"
            ? "border-sky-200/90 bg-sky-50/75 text-sky-950 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-100"
            : "border-border/80 bg-muted/40 text-foreground",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 rounded-xl border p-2 shadow-[inset_0_1px_0_var(--hairline-shine)]",
            tone === "warning"
              ? "border-amber-200/90 bg-white/70 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100"
              : tone === "info"
                ? "border-sky-200/90 bg-white/70 text-sky-900 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-100"
                : "border-border bg-[var(--surface-card-elevated)] text-foreground"
          )}
        >
          {icon ?? <ShieldCheck className="h-4 w-4" aria-hidden />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-[0.01em]">{title}</p>
          <div className="mt-1.5 leading-6 text-muted-foreground">{children}</div>
        </div>
      </div>
    </section>
  );
}

