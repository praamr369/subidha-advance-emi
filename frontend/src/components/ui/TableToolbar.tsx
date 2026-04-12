"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type TableToolbarProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
};

export default function TableToolbar({
  title,
  description,
  actions,
  children,
  className,
  footer,
}: TableToolbarProps) {
  return (
    <div
      className={cn(
        "surface-panel-elevated rounded-2xl border border-border bg-card p-5 shadow-sm",
        className
      )}
    >
      {title || description || actions ? (
        <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            {title ? <h3 className="enterprise-section-title text-base">{title}</h3> : null}
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-4">{children}</div>
      {footer ? <div className="mt-4 border-t border-border pt-4">{footer}</div> : null}
    </div>
  );
}
