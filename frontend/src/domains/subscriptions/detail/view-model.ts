export type DetailWinnerHistoryStatus = "WON" | "NOT_WON";

type DetailSurfaceTone = "default" | "success" | "info" | "warning" | "danger";

export type SubscriptionDetailSemanticsInput = {
  contractStatus?: string | null;
  winnerStatus?: string | null;
  winnerMonth?: number | null;
  luckyNumber?: number | null;
  drawId?: number | null;
  drawMonth?: number | null;
  drawRevealedAt?: string | null;
  waiverScope?: string | null;
  waivedEmiCount?: number | null;
  waivedAmount?: string | number | null;
  outstandingAmount?: string | number | null;
  remainingAmount?: string | number | null;
};

export type SubscriptionDetailSemantics = {
  contractStatus: string;
  winnerStatus: DetailWinnerHistoryStatus;
  winnerMonth: number | null;
  luckyNumber: number | null;
  drawId: number | null;
  drawMonth: number | null;
  drawRevealedAt: string | null;
  waiverScope: string | null;
  waivedEmiCount: number;
  waivedAmount: number;
  remainingAmount: number;
  hasWinnerHistory: boolean;
  hasWaiver: boolean;
  isSettled: boolean;
  contractTone: DetailSurfaceTone;
  winnerTone: DetailSurfaceTone;
  waiverTone: DetailSurfaceTone;
  contractHeadline: string;
  contractDescription: string;
  winnerHeadline: string;
  winnerDescription: string;
  waiverHeadline: string;
  waiverDescription: string;
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeToken(value: unknown, fallback = "UNKNOWN"): string {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return normalized || fallback;
}

export function normalizeWinnerHistoryStatus(
  ...values: Array<unknown>
): DetailWinnerHistoryStatus {
  const isWinner = values.some((value) => {
    const normalized = normalizeToken(value, "");
    return normalized === "WON" || normalized === "DRAWN" || normalized === "WINNER";
  });

  return isWinner ? "WON" : "NOT_WON";
}

export function formatWinnerMonthLabel(value: number | null | undefined): string {
  return value == null ? "Not recorded" : `Month ${value}`;
}

export function formatLuckyNumberLabel(value: number | null | undefined): string {
  return value == null ? "—" : `#${String(value).padStart(2, "0")}`;
}

export function buildSubscriptionDetailSemantics(
  input: SubscriptionDetailSemanticsInput
): SubscriptionDetailSemantics {
  const contractStatus = normalizeToken(input.contractStatus);
  const winnerStatus = normalizeWinnerHistoryStatus(input.winnerStatus);
  const winnerMonth = toNullableNumber(input.winnerMonth);
  const luckyNumber = toNullableNumber(input.luckyNumber);
  const drawId = toNullableNumber(input.drawId);
  const drawMonth = toNullableNumber(input.drawMonth);
  const waivedEmiCount = Math.max(0, toNumber(input.waivedEmiCount));
  const waivedAmount = toNumber(input.waivedAmount);
  const remainingAmount = toNumber(
    input.remainingAmount ?? input.outstandingAmount ?? 0
  );
  const hasWinnerHistory = winnerStatus === "WON";
  const hasWaiver = waivedEmiCount > 0 || waivedAmount > 0;
  const isSettled = remainingAmount <= 0.009;
  const waiverScope = input.waiverScope || (hasWinnerHistory ? "FUTURE_EMI_ONLY" : null);

  const contractTone: DetailSurfaceTone =
    contractStatus === "DEFAULTED"
      ? "danger"
      : contractStatus === "COMPLETED"
      ? "success"
      : contractStatus === "WON"
      ? "info"
      : "default";
  const winnerTone: DetailSurfaceTone = hasWinnerHistory ? "success" : "default";
  const waiverTone: DetailSurfaceTone = hasWaiver
    ? isSettled
      ? "success"
      : "info"
    : "default";

  const contractHeadline =
    contractStatus === "COMPLETED"
      ? "Contract fully settled"
      : contractStatus === "WON"
      ? "Contract still settling"
      : contractStatus === "DEFAULTED"
      ? "Contract needs recovery"
      : "Contract in progress";

  const contractDescription =
    contractStatus === "COMPLETED" && hasWinnerHistory
      ? "This winner subscription is fully settled. Winner history remains part of the contract record."
      : contractStatus === "COMPLETED"
      ? "All EMI rows are settled through paid or waived entries."
      : contractStatus === "WON"
      ? "Winner benefit is recorded, but at least one EMI row still requires settlement."
      : contractStatus === "DEFAULTED"
      ? "Defaulted status is preserved as the contract lifecycle state."
      : "Contract lifecycle remains active until all EMI rows are settled.";

  const winnerHeadline = hasWinnerHistory
    ? "Winner benefit recorded"
    : "No winner benefit recorded";
  const winnerDescription = hasWinnerHistory
    ? isSettled
      ? `${formatWinnerMonthLabel(winnerMonth)} won the draw. The contract later reached a fully settled state without losing winner history.`
      : `${formatWinnerMonthLabel(winnerMonth)} won the draw. Contract status stays WON until remaining EMI exposure is settled.`
    : "Winner history is shown only when backend draw and waiver evidence is present.";

  const waiverHeadline = hasWaiver
    ? isSettled
      ? "Waiver settled the remaining exposure"
      : "Waiver applied to future EMI rows"
    : "No waiver currently recorded";
  const waiverDescription = hasWaiver
    ? `${waivedEmiCount} EMI rows were waived for ${waiverScope || "FUTURE_EMI_ONLY"}. Recorded waived amount is ${waivedAmount.toFixed(
        2
      )}.`
    : "Waiver posture is based only on stored EMI rows and ledger-aware totals.";

  return {
    contractStatus,
    winnerStatus,
    winnerMonth,
    luckyNumber,
    drawId,
    drawMonth,
    drawRevealedAt: input.drawRevealedAt || null,
    waiverScope,
    waivedEmiCount,
    waivedAmount,
    remainingAmount,
    hasWinnerHistory,
    hasWaiver,
    isSettled,
    contractTone,
    winnerTone,
    waiverTone,
    contractHeadline,
    contractDescription,
    winnerHeadline,
    winnerDescription,
    waiverHeadline,
    waiverDescription,
  };
}
