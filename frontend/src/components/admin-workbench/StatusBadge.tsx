import type { ComponentProps } from "react";

import BaseStatusBadge from "@/components/ui/status-badge";

export default function StatusBadge(props: ComponentProps<typeof BaseStatusBadge>) {
  return <BaseStatusBadge {...props} />;
}
