import { StatusBadge } from "@/shared/ui/StatusBadge";
import type { LifecycleStatus } from "../api/product.types";

const lifecycleVariants: Record<
  LifecycleStatus,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  ACTIVE: "success",
  UPCOMING: "info",
  DISCONTINUED: "danger",
  MAINTENANCE: "warning",
};

export function LifecycleBadge({ status }: { status: LifecycleStatus }) {
  return <StatusBadge label={status} variant={lifecycleVariants[status]} />;
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <StatusBadge
      label={isActive ? "Active" : "Inactive"}
      variant={isActive ? "success" : "neutral"}
    />
  );
}

export function InventoryBadge({ ready }: { ready: boolean }) {
  return (
    <StatusBadge
      label={ready ? "Linked" : "No Profile"}
      variant={ready ? "info" : "neutral"}
    />
  );
}
