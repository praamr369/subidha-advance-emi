"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ERPActionPanelProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export default function ERPActionPanel({ title, description, children, className }: ERPActionPanelProps) {
  return (
    <aside
      className={cn(
        "surface-panel-elevated rounded-[1.6rem] border border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-card-elevated)_92%,white_8%),color-mix(in_oklab,var(--surface-card-soft)_78%,var(--surface-muted)_22%))] p-4 shadow-[0_22px_55px_-46px_rgba(15,23,42,0.4)]",
        className
      )}
    >
      {title ? (
        <div className="border-b border-border/80 pb-3">
          <p className="text-sm font-semibold tracking-[0.01em] text-foreground">{title}</p>
          {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
      <div className={cn("min-w-0", title ? "pt-3" : "")}>{children}</div>
    </aside>
  );
}

