import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  CheckCheck,
  CheckCircle2,
  Circle,
  Clock3,
  FolderOpen,
  Lock,
  RefreshCw,
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
};

const STATUS_META: Record<string, Omit<StatusPresentation, "token">> = {
  ACTIVE: { label: "Active", tone: "success", icon: CheckCircle2 },
  INACTIVE: { label: "Inactive", tone: "neutral", icon: Lock },
  PENDING: { label: "Pending", tone: "warning", icon: Clock3 },
  APPROVED: { label: "Approved", tone: "success", icon: BadgeCheck },
  VERIFIED: { label: "Verified", tone: "success", icon: BadgeCheck },
  REJECTED: { label: "Rejected", tone: "danger", icon: AlertTriangle },
  NOT_PROVIDED: { label: "Not Provided", tone: "neutral", icon: Circle },
  SUBMITTED: { label: "Submitted", tone: "warning", icon: Clock3 },
  UNDER_REVIEW: { label: "Under Review", tone: "info", icon: RefreshCw },
  RECORDED: { label: "Recorded", tone: "success", icon: BadgeCheck },
  PAID: { label: "Paid", tone: "success", icon: BadgeCheck },
  WAIVED: { label: "Waived", tone: "info", icon: CheckCheck },
  OVERDUE: { label: "Overdue", tone: "danger", icon: AlertTriangle },
  WON: { label: "Won", tone: "info", icon: Trophy },
  NOT_WON: { label: "Not Won", tone: "neutral", icon: Circle },
  COMPLETED: { label: "Completed", tone: "neutral", icon: CheckCheck },
  DEFAULTED: { label: "Defaulted", tone: "danger", icon: AlertTriangle },
  REVERSED: { label: "Reversed", tone: "warning", icon: Undo2 },
  OPEN: { label: "Open", tone: "info", icon: FolderOpen },
  CLOSED: { label: "Closed", tone: "neutral", icon: Lock },
  AVAILABLE: { label: "Available", tone: "success", icon: CheckCircle2 },
  ASSIGNED: { label: "Assigned", tone: "warning", icon: Clock3 },
  BLOCKED: { label: "Blocked", tone: "danger", icon: AlertTriangle },
  DRAFT: { label: "Draft", tone: "neutral", icon: Archive },
  FULL: { label: "Full", tone: "warning", icon: Archive },
  DRAW_IN_PROGRESS: {
    label: "Draw In Progress",
    tone: "warning",
    icon: RefreshCw,
  },
  CANCELLED: { label: "Cancelled", tone: "neutral", icon: Lock },
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
    };
  }

  return {
    token,
    label: options?.label?.trim() || toTitleCase(token || "UNKNOWN"),
    tone: "default",
    icon: Circle,
  };
}

export const statusVariant: Record<
  string,
  "success" | "warning" | "destructive" | "neutral"
> = {
  ACTIVE: "success",
  PENDING: "warning",
  PAID: "success",
  WAIVED: "neutral",
  OVERDUE: "destructive",
  WON: "success",
  COMPLETED: "neutral",
  DEFAULTED: "destructive",
  REVERSED: "warning",
  OPEN: "success",
  CLOSED: "neutral",
};
