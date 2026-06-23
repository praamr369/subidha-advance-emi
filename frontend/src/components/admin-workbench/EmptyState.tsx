import type { ComponentProps } from "react";

import BaseEmptyState from "@/components/ui/EmptyState";

export default function EmptyState(props: ComponentProps<typeof BaseEmptyState>) {
  return <BaseEmptyState {...props} />;
}
