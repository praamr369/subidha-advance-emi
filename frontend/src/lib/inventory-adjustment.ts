import type { StockAdjustment, StockAdjustmentLine } from "@/services/inventory";

/**
 * Pure display helpers for the stock adjustment workflow.
 *
 * Core safety rule (mirrors the backend): an unknown unit cost / valuation is
 * reported as `null` and rendered as "Not available" — never coerced to ₹0.
 * Posting math, journal rules, and ledger immutability live in the backend and
 * are not reimplemented here.
 */

function parseDecimal(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Resolve the effective unit cost for a *draft form line* preview.
 * Preference order: explicit unit-cost input → item standard cost → unknown.
 * Returns `null` when neither is available (never 0).
 */
export function resolveEffectiveUnitCost(
  unitCostInput: string | number | null | undefined,
  standardUnitCost: string | number | null | undefined
): number | null {
  const explicit = parseDecimal(unitCostInput);
  if (explicit !== null) return explicit;
  return parseDecimal(standardUnitCost);
}

export type LineValuationPreview = {
  effectiveUnitCost: number | null;
  lineValuation: number | null;
  /** True only when a real valuation could be computed from a known unit cost. */
  available: boolean;
};

/**
 * Compute the live `|quantity delta| × unit cost = line valuation` preview for
 * the draft form. Missing unit cost yields `available: false` (→ "Not available").
 */
export function computeLineValuationPreview(
  quantityDelta: string | number | null | undefined,
  unitCostInput: string | number | null | undefined,
  standardUnitCost: string | number | null | undefined
): LineValuationPreview {
  const effectiveUnitCost = resolveEffectiveUnitCost(unitCostInput, standardUnitCost);
  const qty = parseDecimal(quantityDelta);
  if (effectiveUnitCost === null || qty === null) {
    return { effectiveUnitCost, lineValuation: null, available: false };
  }
  const lineValuation = Math.abs(qty) * effectiveUnitCost;
  return { effectiveUnitCost, lineValuation, available: true };
}

/** True when this draft form line will block posting because no cost is known. */
export function draftLineNeedsUnitCost(
  unitCostInput: string | number | null | undefined,
  standardUnitCost: string | number | null | undefined
): boolean {
  return resolveEffectiveUnitCost(unitCostInput, standardUnitCost) === null;
}

/**
 * Short row blocker label for the register. Prefers the backend-provided
 * blocker text; falls back to "Missing unit cost" for the unit-cost case.
 */
export function adjustmentRowBlockerLabel(adjustment: StockAdjustment): string | null {
  if (adjustment.can_post) return null;
  if (adjustment.requires_unit_cost) return "Missing unit cost";
  const blockers = adjustment.posting_blockers ?? [];
  return blockers.length > 0 ? blockers[0] : null;
}

/** Whether the register should render a "Post" affordance for this row at all. */
export function adjustmentIsApproved(adjustment: StockAdjustment): boolean {
  return adjustment.status === "APPROVED";
}

/**
 * Per-row line valuation summary for the register column. Returns display
 * tokens only — `null` entries map to "Not available" in the component.
 */
export function adjustmentLineValuationTokens(
  adjustment: StockAdjustment
): Array<string | null> {
  return (adjustment.lines ?? []).map((line: StockAdjustmentLine) => {
    // Posted lines carry a frozen snapshot; pre-posting lines expose the
    // computed readiness preview. Either way, unknown stays unknown.
    const value = line.valuation_amount_snapshot ?? line.line_valuation ?? null;
    return value === null || value === undefined ? null : String(value);
  });
}
