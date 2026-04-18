// frontend/src/components/layout/PageContainer.tsx
import type { ReactNode } from "react";

import { SectionHeader } from "@/components/ui/portal-primitives";
import { cn } from "@/lib/utils";

export default function PageContainer({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      <SectionHeader title={title} description={subtitle} actions={actions} />
      <div>{children}</div>
    </div>
  );
}
