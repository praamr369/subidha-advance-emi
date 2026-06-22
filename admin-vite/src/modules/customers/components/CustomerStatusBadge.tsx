import { StatusBadge } from "@/shared/ui/StatusBadge";
import type { KycStatus, CustomerStatus } from "../api/customer.types";

const kycVariants: Record<
  KycStatus,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  APPROVED: "success",
  VERIFIED: "success",
  SUBMITTED: "info",
  PENDING: "warning",
  REJECTED: "danger",
};

export function KycBadge({ status }: { status: KycStatus }) {
  return <StatusBadge label={status} variant={kycVariants[status]} />;
}

export function ActiveBadge({ status }: { status: CustomerStatus }) {
  return (
    <StatusBadge
      label={status}
      variant={status === "ACTIVE" ? "success" : "neutral"}
    />
  );
}
