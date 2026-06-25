"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type DuplicateCheckPanelProps = {
  title?: string;
  description?: ReactNode;
  status: "idle" | "checking" | "clear" | "possible_duplicates" | "error";
  children?: ReactNode;
  className?: string;
};

export default function DuplicateCheckPanel({
  title = "Duplicate check",
  description,
  status,
  children,
  className,
}: DuplicateCheckPanelProps) {
  const badge =
    status === "checking"
      ? "Checking..."
      : status === "clear"
        ? "Clear"
        : status === "possible_duplicates"
          ? "Review"
          : status === "error"
            ? "Error"
            : "Idle";

  return (
    <div className={cn("rounded-xl border border-border/70 bg-muted/20 px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {badge}
        </div>
      </div>
      {description ? <div className="mt-2 text-sm text-muted-foreground">{description}</div> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

