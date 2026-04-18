// frontend/src/components/ui/EmptyState.tsx
import type { ReactNode } from "react";

import { PortalEmptyState } from "@/components/ui/portal-primitives";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
};

export default function EmptyState({ title, description, icon }: EmptyStateProps) {
  return <PortalEmptyState title={title} description={description} icon={icon} />;
}
