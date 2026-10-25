// frontend/src/components/ui/PageHeader.tsx
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";

import { openAdminHelp } from "@/components/admin/help/AdminHelpDrawer";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  helperNote?: string;
  helperTone?: "default" | "info" | "warning";
  actions?: ReactNode;
  className?: string;
};

export default function PageHeader({
  eyebrow,
  title,
  description,
  helperNote,
  helperTone = "default",
  actions,
  className,
}: PageHeaderProps) {
  const pathname = usePathname() || "";
  const isAdminRoute = pathname.startsWith("/admin");

  return (
    <div
      className={cn(
        "workspace-header-panel flex flex-col gap-4 p-6 md:flex-row md:items-start md:justify-between",
        className
      )}
    >
      <div>
        {eyebrow ? <p className="enterprise-eyebrow">{eyebrow}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="enterprise-title text-2xl">{title}</h1>
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
        {description && (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        )}
        {helperNote ? (
          <div
            className={cn(
              "mt-3 inline-flex max-w-3xl rounded-xl border px-3 py-2 text-xs font-medium leading-6",
              helperTone === "warning"
                ? "border-amber-200/90 bg-amber-50/85 text-amber-900"
                : helperTone === "info"
                  ? "border-sky-200/90 bg-sky-50/85 text-sky-900"
                  : "border-border bg-muted/50 text-foreground"
            )}
          >
            {helperNote}
          </div>
        ) : null}
      </div>
      {actions && (
        <div className="workspace-action-bar flex flex-wrap items-center gap-2 p-2">
          {actions}
        </div>
      )}
    </div>
  );
}
