import type {
  AdminEmiCollectionCandidate,
  AdminSubscriptionCollectionCandidate,
} from "@/services/payments";

/**
 * Operator-facing EMI installment display helpers.
 *
 * The installment number shown to operators is the subscription-local sequence
 * (`installment_no` / `month_no`), NEVER the global database id. The real
 * `emi.id` is still used as the internal select value and payment payload — these
 * helpers only affect what humans read.
 *
 * Unknown outstanding amounts resolve to `null` (rendered "Not available"),
 * never a fabricated ₹0.
 */

export function ordinal(value: number): string {
  const n = Math.trunc(value);
  if (!Number.isFinite(n) || n <= 0) return String(value);
  const mod100 = n % 100;
  if (mod100 >= 10 && mod100 <= 20) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

export function resolveInstallmentNo(
  emi: AdminEmiCollectionCandidate
): number | null {
  if (typeof emi.installment_no === "number" && emi.installment_no > 0) {
    return emi.installment_no;
  }
  if (typeof emi.month_no === "number" && emi.month_no > 0) {
    return emi.month_no;
  }
  return null;
}

export function resolveTotalInstallments(
  emi: AdminEmiCollectionCandidate,
  subscription?: AdminSubscriptionCollectionCandidate | null
): number | null {
  if (typeof emi.total_installments === "number" && emi.total_installments > 0) {
    return emi.total_installments;
  }
  if (
    subscription &&
    typeof subscription.tenure_months === "number" &&
    subscription.tenure_months > 0
  ) {
    return subscription.tenure_months;
  }
  return null;
}

/**
 * Short installment label, e.g. "1st EMI of 15". Prefers the backend-provided
 * `installment_label`; falls back to a locally built ordinal label, and only as
 * a last resort (no installment number at all) shows the raw id reference.
 */
export function emiInstallmentLabel(
  emi: AdminEmiCollectionCandidate,
  subscription?: AdminSubscriptionCollectionCandidate | null
): string {
  if (emi.installment_label && emi.installment_label.trim()) {
    return emi.installment_label.trim();
  }
  const installmentNo = resolveInstallmentNo(emi);
  if (installmentNo === null) {
    return `EMI #${emi.id}`;
  }
  const total = resolveTotalInstallments(emi, subscription);
  const base = `${ordinal(installmentNo)} EMI`;
  return total ? `${base} of ${total}` : base;
}

function parseAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Resolve the collectible outstanding amount as a numeric string, or `null`
 * when genuinely unknown. A backend-provided outstanding (including an explicit
 * "0.00") is always trusted. Otherwise we only compute when the EMI carries a
 * real positive nominal amount — a fabricated/placeholder 0 stays "unknown".
 */
export function resolveOutstandingAmount(
  emi: AdminEmiCollectionCandidate | null | undefined
): string | null {
  if (!emi) return null;
  if (
    emi.outstanding_amount !== undefined &&
    emi.outstanding_amount !== null &&
    String(emi.outstanding_amount).trim() !== ""
  ) {
    return String(emi.outstanding_amount);
  }
  const amount = parseAmount(emi.amount);
  if (amount === null || amount <= 0) {
    return null;
  }
  const paid = parseAmount(emi.paid_amount) ?? 0;
  const waived = parseAmount(emi.waived_amount) ?? 0;
  const outstanding = amount - paid - waived;
  return outstanding > 0 ? outstanding.toFixed(2) : "0.00";
}

/** True when this EMI must not be collected against (already settled). */
export function isEmiCollectible(emi: AdminEmiCollectionCandidate): boolean {
  const status = (emi.status || "").toUpperCase();
  return status !== "PAID" && status !== "WAIVED";
}
