"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type TableToolbarProps = {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
};

export default function TableToolbar({
  children,
  className,
  footer,
}: TableToolbarProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-sm",
        className
      )}
    >
      <div className="flex flex-col gap-4">{children}</div>
      {footer ? <div className="mt-4 border-t border-border pt-4">{footer}</div> : null}
    </div>
  );
}
