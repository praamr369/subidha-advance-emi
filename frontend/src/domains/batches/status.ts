export type CanonicalBatchStatus =
  | "DRAFT"
  | "OPEN"
  | "FULL"
  | "DRAW_IN_PROGRESS"
  | "COMPLETED"
  | "CLOSED";

export type BatchStatus = CanonicalBatchStatus | "UNKNOWN";

export const BATCH_STATUS_OPTIONS: CanonicalBatchStatus[] = [
  "DRAFT",
  "OPEN",
  "FULL",
  "DRAW_IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
];

export const BATCH_LIFECYCLE_TRANSITION_NOTE =
  "DRAFT can move to OPEN. OPEN can move to FULL or DRAW_IN_PROGRESS. FULL can move to DRAW_IN_PROGRESS. DRAW_IN_PROGRESS can move to COMPLETED. COMPLETED can move to CLOSED.";

const BATCH_STATUS_TRANSITIONS: Record<CanonicalBatchStatus, CanonicalBatchStatus[]> = {
  DRAFT: ["OPEN"],
  OPEN: ["FULL", "DRAW_IN_PROGRESS"],
  FULL: ["DRAW_IN_PROGRESS"],
  DRAW_IN_PROGRESS: ["COMPLETED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
};

export function normalizeBatchStatus(value: unknown): BatchStatus {
  const status = String(value ?? "").toUpperCase();

  if (BATCH_STATUS_OPTIONS.includes(status as CanonicalBatchStatus)) {
    return status as CanonicalBatchStatus;
  }

  return "UNKNOWN";
}

export function normalizeBatchFilterStatus(
  value: string | null | undefined
): "" | CanonicalBatchStatus {
  const normalized = normalizeBatchStatus(value);
  return normalized === "UNKNOWN" ? "" : normalized;
}

export function nextAllowedBatchStatuses(
  status: BatchStatus
): CanonicalBatchStatus[] {
  if (status === "UNKNOWN") return [];
  return BATCH_STATUS_TRANSITIONS[status];
}

export function isLiveBatchStatus(status: BatchStatus): boolean {
  return (
    status === "OPEN" ||
    status === "FULL" ||
    status === "DRAW_IN_PROGRESS"
  );
}
