import type {
  CanonicalDashboardSummary,
  DashboardReconciliationSurface,
  DashboardWinnerSurface,
} from "@/services/dashboard-types";

export function money(value: string | number | undefined | null): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function buildSettlementPosture(summary: CanonicalDashboardSummary) {
  const remainingAmount = Number(
    summary.remaining_amount ?? summary.outstanding_amount ?? 0
  );
  const overdueEmis = Number(summary.overdue_emis ?? 0);
  const nextDueDate = summary.next_due_date;
  const nextDueAmount = summary.next_due_amount;

  if (remainingAmount <= 0) {
    return {
      title: "Scoped contracts are currently settled",
      description:
        "Paid and waived EMI history already closes the contract exposure visible in this dashboard scope.",
      tone: "dashboard-posture-success",
      badgeClass: "chip-tone-success",
      badgeLabel: "Settled",
    };
  }

  if (overdueEmis > 0) {
    return {
      title: `${overdueEmis} overdue EMI need attention`,
      description: `Overdue exposure currently stands at ${money(
        summary.overdue_amount
      )}.`,
      tone: "dashboard-posture-warning",
      badgeClass: "chip-tone-warning",
      badgeLabel: "Overdue",
    };
  }

  return {
    title: "Settlement is in progress on schedule",
    description: nextDueDate
      ? `The next scheduled EMI is ${money(nextDueAmount)} on ${formatDate(
          nextDueDate
        )}.`
      : "There is remaining exposure, but no next due row is currently visible in scope.",
    tone: "dashboard-posture-info",
    badgeClass: "chip-tone-info",
    badgeLabel: "In progress",
  };
}

export function buildWinnerPosture(
  winnerSurface?: DashboardWinnerSurface,
  summary?: CanonicalDashboardSummary
) {
  const winnerSubscriptions = Number(
    winnerSurface?.winner_subscriptions ?? summary?.winner_subscriptions ?? 0
  );
  const waivedAmount = Number(
    winnerSurface?.total_waived_amount ?? summary?.total_waived_amount ?? 0
  );
  const waivedEmis = Number(
    winnerSurface?.waived_emis ?? summary?.waived_emis ?? 0
  );

  if (winnerSubscriptions > 0 || waivedAmount > 0 || waivedEmis > 0) {
    return {
      title: "Winner benefit is already reflected in scoped totals",
      description:
        winnerSurface?.note ??
        `${winnerSubscriptions} subscription${
          winnerSubscriptions === 1 ? "" : "s"
        } carry winner history, and ${money(
          waivedAmount
        )} is already recorded as waived EMI value.`,
      badgeClass:
        "border border-[color-mix(in_oklab,oklch(0.5_0.1_290)_32%,var(--border)_68%)] bg-[color-mix(in_oklab,oklch(0.45_0.06_290)_14%,var(--card)_86%)] text-foreground shadow-[var(--badge-inset-highlight)]",
      badgeLabel: "Winner benefit",
    };
  }

  return {
    title: "No winner waiver is currently recorded",
    description:
      winnerSurface?.note ??
      "If a draw benefit is applied later, it should stay separate from payment settlement and contract status.",
    badgeClass: "border border-border bg-muted text-muted-foreground shadow-[var(--badge-inset-highlight)]",
    badgeLabel: "No winner benefit",
  };
}

export function buildReconciliationPosture(
  reconciliation?: DashboardReconciliationSurface
) {
  const flaggedCount = Number(reconciliation?.flagged_count ?? 0);
  const checkedCount = Number(reconciliation?.checked_count ?? 0);

  if (flaggedCount > 0) {
    return {
      title: `${flaggedCount} scoped subscriptions need reconciliation review`,
      description:
        reconciliation?.note ??
        "Use the reconciliation drilldown to review the mismatched rows before manual finance action.",
      badgeClass: "chip-tone-warning",
      badgeLabel: "Needs review",
      tone: "dashboard-posture-warning",
    };
  }

  return {
    title: "No reconciliation drift is currently flagged",
    description:
      checkedCount > 0
        ? `${checkedCount} scoped subscriptions were checked without mismatch warnings.`
        : reconciliation?.note ?? "No reconciliation rows are currently visible in scope.",
    badgeClass: "chip-tone-success",
    badgeLabel: "Aligned",
    tone: "dashboard-posture-success",
  };
}
