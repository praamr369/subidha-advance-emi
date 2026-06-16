import test from "node:test";
import assert from "node:assert/strict";

import {
  adjustmentRowBlockerLabel,
  computeLineValuationPreview,
  draftLineNeedsUnitCost,
  resolveEffectiveUnitCost,
} from "../../src/lib/inventory-adjustment";
import type { StockAdjustment } from "../../src/services/inventory";

function adjustment(overrides: Partial<StockAdjustment>): StockAdjustment {
  return {
    id: 1,
    adjustment_no: "ADJ-1",
    adjustment_date: "2026-06-16",
    status: "APPROVED",
    lines: [],
    ...overrides,
  };
}

test("effective unit cost prefers explicit input over standard cost", () => {
  assert.equal(resolveEffectiveUnitCost("12.50", "99.00"), 12.5);
  assert.equal(resolveEffectiveUnitCost("", "99.00"), 99);
  assert.equal(resolveEffectiveUnitCost(null, "99.00"), 99);
});

test("missing unit cost resolves to null, never zero", () => {
  assert.equal(resolveEffectiveUnitCost("", null), null);
  assert.equal(resolveEffectiveUnitCost(null, undefined), null);
});

test("line valuation preview updates when unit cost entered", () => {
  // No cost known -> unavailable, not 0.
  const unknown = computeLineValuationPreview("-2", "", null);
  assert.equal(unknown.available, false);
  assert.equal(unknown.lineValuation, null);

  // Operator enters unit cost -> preview computes |qty| * cost.
  const withCost = computeLineValuationPreview("-2", "30.00", null);
  assert.equal(withCost.available, true);
  assert.equal(withCost.lineValuation, 60);

  // Standard cost fallback also computes.
  const withStandard = computeLineValuationPreview("3", "", "10.00");
  assert.equal(withStandard.available, true);
  assert.equal(withStandard.lineValuation, 30);
});

test("draft line flags missing unit cost only when no cost is resolvable", () => {
  assert.equal(draftLineNeedsUnitCost("", null), true);
  assert.equal(draftLineNeedsUnitCost("5.00", null), false);
  assert.equal(draftLineNeedsUnitCost("", "99.00"), false);
});

test("row blocker label surfaces missing unit cost, not a load failure", () => {
  const blocked = adjustment({
    can_post: false,
    requires_unit_cost: true,
    posting_blockers: ["Unit cost is required before posting this stock adjustment."],
  });
  assert.equal(adjustmentRowBlockerLabel(blocked), "Missing unit cost");

  const ready = adjustment({ can_post: true, requires_unit_cost: false });
  assert.equal(adjustmentRowBlockerLabel(ready), null);

  const otherBlocker = adjustment({
    can_post: false,
    requires_unit_cost: false,
    posting_blockers: ["Reason is required before posting a stock adjustment."],
  });
  assert.equal(
    adjustmentRowBlockerLabel(otherBlocker),
    "Reason is required before posting a stock adjustment."
  );
});
