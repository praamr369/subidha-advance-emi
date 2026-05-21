"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SmartFormShellProps = {
  children: ReactNode;
  sidePanel?: ReactNode;
  className?: string;
};

export default function SmartFormShell({ children, sidePanel, className }: SmartFormShellProps) {
  return (
    <div className={cn("grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]", className)}>
      <div className="min-w-0 space-y-4">{children}</div>
      {sidePanel ? <aside className="min-w-0 space-y-4">{sidePanel}</aside> : null}
    </div>
  );
}

