"use client";

import type { ReactNode } from "react";

import { DataToolbar, PageSection, SectionHeader } from "@/components/ui/portal-primitives";
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
    <PageSection className={cn("p-5", className)}>
      {title || description || actions ? (
        <SectionHeader title={title || "Workspace"} description={description} actions={actions} />
      ) : null}
      <div className={cn("flex flex-col gap-4", title || description || actions ? "mt-4" : "")}>{children}</div>
      {footer ? (
        <DataToolbar className="mt-4 border-t border-border pt-4 shadow-none">
          <div className="w-full">{footer}</div>
        </DataToolbar>
      ) : null}
    </PageSection>
  );
}
