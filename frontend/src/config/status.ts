import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  Banknote,
  CheckCheck,
  CheckCircle2,
  Circle,
  Clock3,
  FolderOpen,
  Landmark,
  Lock,
  RefreshCw,
  Smartphone,
  Trophy,
  Undo2,
  type LucideIcon,
} from "lucide-react";

export type StatusTone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export type StatusPresentation = {
  token: string;
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
  /** Operator tooltip: collection / delivery semantics (visual only; backend rules unchanged). */
  hint?: string;
};

type StatusMetaEntry = {
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
  hint?: string;
};

const STATUS_META: Record<string, StatusMetaEntry> = {
  ACTIVE: { label: "Active", tone: "success", icon: CheckCircle2 },
  INACTIVE: { label: "Inactive", tone: "neutral", icon: Lock },
  PENDING: {
    label: "Pending",
    tone: "warning",
    icon: Clock3,
    hint: "Outstanding. Collectible when due unless business rules block collection.",
  },
  APPROVED: { label: "Approved", tone: "success", icon: BadgeCheck },
  VERIFIED: { label: "Verified", tone: "success", icon: BadgeCheck },
  REJECTED: { label: "Rejected", tone: "danger", icon: AlertTriangle },
  NOT_PROVIDED: { label: "Not Provided", tone: "neutral", icon: Circle },
  SUBMITTED: { label: "Submitted", tone: "warning", icon: Clock3 },
  UNDER_REVIEW: { label: "Under Review", tone: "info", icon: RefreshCw },
  RECORDED: { label: "Recorded", tone: "success", icon: BadgeCheck },
  PAID: {
    label: "Paid",
    tone: "neutral",
    icon: BadgeCheck,
    hint: "Settled. Not payable / not collectible on this line.",
  },
  WAIVED: {
    label: "Waived",
    tone: "neutral",
    icon: CheckCheck,
    hint: "Benefit applied. No EMI payable on this line.",
  },
  OVERDUE: {
    label: "Overdue",
    tone: "danger",
    icon: AlertTriangle,
    hint: "Past due. Collectible where the backend and your role allow collection.",
  },
  WON: { label: "Won", tone: "info", icon: Trophy },
  NOT_WON: { label: "Not Won", tone: "neutral", icon: Circle },
  COMPLETED: { label: "Completed", tone: "neutral", icon: CheckCheck },
  DEFAULTED: { label: "Defaulted", tone: "danger", icon: AlertTriangle },
  REVERSED: {
    label: "Reversed",
    tone: "neutral",
    icon: Undo2,
    hint: "Ledger reversed. Not collectible.",
  },
  OPEN: { label: "Open", tone: "info", icon: FolderOpen },
  CLOSED: { label: "Closed", tone: "neutral", icon: Lock },
  AVAILABLE: { label: "Available", tone: "success", icon: CheckCircle2 },
  ASSIGNED: { label: "Assigned", tone: "warning", icon: Clock3 },
  BLOCKED: { label: "Blocked", tone: "danger", icon: AlertTriangle },
  FAILED: { label: "Failed", tone: "danger", icon: AlertTriangle },
  DRAFT: { label: "Draft", tone: "neutral", icon: Archive },
  VOID: {
    label: "Void",
    tone: "neutral",
    icon: Archive,
    hint: "Invalidated. Not collectible.",
  },
  ARCHIVED: {
    label: "Archived",
    tone: "neutral",
    icon: Archive,
    hint: "Inactive for new operational actions.",
  },
  RETURNED: {
    label: "Returned",
    tone: "neutral",
    icon: Undo2,
    hint: "Goods returned. Do not treat as normal in-transit delivery.",
  },
  LOCKED: { label: "Locked", tone: "neutral", icon: Lock },
  FULL: { label: "Full", tone: "warning", icon: Archive },
  DRAW_IN_PROGRESS: {
    label: "Draw In Progress",
    tone: "warning",
    icon: RefreshCw,
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "neutral",
    icon: Lock,
    hint: "Cancelled. Not collectible.",
  },
  CREDITED_FULLY: { label: "Credited Fully", tone: "neutral", icon: CheckCheck },
  CASH: { label: "Cash", tone: "success", icon: Banknote },
  UPI: { label: "UPI", tone: "info", icon: Smartphone },
  BANK: { label: "Bank", tone: "info", icon: Landmark },
};

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeStatusToken(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function resolveStatusPresentation(
  value: string | null | undefined,
  options?: {
    isOverdue?: boolean;
    label?: string | null;
  }
): StatusPresentation {
  const normalized = normalizeStatusToken(value);
  const token =
    options?.isOverdue && normalized === "PENDING" ? "OVERDUE" : normalized;
  const meta = STATUS_META[token];

  if (meta) {
    return {
      token,
      label: options?.label?.trim() || meta.label,
      tone: meta.tone,
      icon: meta.icon,
      hint: meta.hint,
    };
  }

  return {
    token,
    label: options?.label?.trim() || toTitleCase(token || "UNKNOWN"),
    tone: "default",
    icon: Circle,
  };
}
