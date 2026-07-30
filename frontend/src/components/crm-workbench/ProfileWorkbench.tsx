"use client";

import type { ReactNode } from "react";
import ERPPageShell, { type ERPPageShellProps } from "@/components/erp/ERPPageShell";

type ProfileWorkbenchProps = Omit<ERPPageShellProps, "children"> & {
  children?: ReactNode;
  toolbar?: ReactNode;
  content?: ReactNode;
};

export function ProfileWorkbench({
  children,
  toolbar,
  content,
  ...shellProps
}: ProfileWorkbenchProps) {
  return (
    <ERPPageShell {...shellProps}>
      <div className="space-y-6">
        {toolbar ? (
          <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
            {toolbar}
          </div>
        ) : null}

        {content || children}
      </div>
    </ERPPageShell>
  );
}
