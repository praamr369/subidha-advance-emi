"use client";

import type { ReactNode } from "react";

import { PageSection, SectionHeader } from "@/components/ui/portal-primitives";
import { cn } from "@/lib/utils";

type ERPSectionShellProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export default function ERPSectionShell({
  title,
  description,
  actions,
  children,
  footer,
  className,
}: ERPSectionShellProps) {
  const showHeader = Boolean(title || description || actions);

  return (
    <PageSection className={cn("relative", className)}>
      {showHeader ? (
        <SectionHeader title={title ?? "Section"} description={description} actions={actions} />
      ) : null}
      <div className={cn("flex min-w-0 flex-col gap-4", showHeader ? "mt-4" : "")}>{children}</div>
      {footer ? <div className="mt-4 border-t border-border/80 pt-4">{footer}</div> : null}
    </PageSection>
  );
}

