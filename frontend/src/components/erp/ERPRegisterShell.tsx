"use client";

import type { ReactNode } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPPageHeader from "@/components/erp/ERPPageHeader";
import { cn } from "@/lib/utils";

type ERPRegisterShellProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Register/list workspace framing only.
 * - No data fetching
 * - No route assumptions (actions/links are passed by callers)
 * - Keeps business behavior in page components
 */
export default function ERPRegisterShell({
  eyebrow,
  title,
  description,
  status,
  actions,
  toolbar,
  children,
  className,
}: ERPRegisterShellProps) {
  return (
    <ERPPageShell title={title} eyebrow={eyebrow} subtitle={description} className={cn("px-0 py-0", className)}>
      <div className="flex flex-col gap-4">
        <ERPPageHeader eyebrow={eyebrow} title={title} description={description} status={status} actions={actions} />
        {toolbar ? <div className="min-w-0">{toolbar}</div> : null}
        <div className="min-w-0">{children}</div>
      </div>
    </ERPPageShell>
  );
}

