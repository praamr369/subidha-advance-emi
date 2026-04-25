import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { PortalEmptyState } from "@/components/ui/portal-primitives";

type EmptyStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  illustration?: ReactNode;
  tone?: "default" | "info";
};

export default function EmptyState({
  title = "No data",
  description,
  action,
  icon,
  illustration,
  tone = "default",
}: EmptyStateProps) {
  return (
    <PortalEmptyState
      title={title}
      description={description}
      action={action}
      icon={icon ?? illustration ?? <Inbox className="h-5 w-5" />}
      className={cn(
        tone === "info"
          ? "border-sky-200/80 bg-sky-50/65"
          : "border-border bg-[var(--surface-muted)]/45"
      )}
    />
  );
}
