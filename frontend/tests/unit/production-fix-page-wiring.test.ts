import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();

const collectPageSource = readFileSync(
  join(rootDir, "src/domains/payments/pages/AdminPaymentCollectPage.tsx"),
  "utf8"
);
const adjustmentsPageSource = readFileSync(
  join(rootDir, "src/app/(dashboard)/admin/inventory/adjustments/page.tsx"),
  "utf8"
);

test("collect page builds the EMI dropdown label from the installment helper", () => {
  assert.ok(collectPageSource.includes("emiInstallmentLabel"));
  assert.ok(collectPageSource.includes("getEmiLabel(emi, selectedSubscription)"));
});

test("selected EMI card shows Installment label, not the raw db id", () => {
  assert.ok(collectPageSource.includes('label="Installment"'));
  assert.ok(collectPageSource.includes("value={selectedEmiLabel}"));
  // The raw "#id" primary label for the selected EMI must be gone.
  assert.ok(!collectPageSource.includes("value={selectedEmi ? `#${selectedEmi.id}` : \"—\"}"));
});

test("payment payload still submits the real emi_id", () => {
  assert.ok(collectPageSource.includes("emi: Number(form.emi_id)"));
});

test("PAID/WAIVED EMIs are blocked from collection", () => {
  assert.ok(collectPageSource.includes("isEmiCollectible(emi)"));
  assert.ok(collectPageSource.includes("disabled={!isEmiCollectible(emi)}"));
});

test("adjustments register separates load errors from posting/validation errors", () => {
  // The data table only receives the load error surface.
  assert.ok(adjustmentsPageSource.includes("error={loadError}"));
  assert.ok(adjustmentsPageSource.includes("setFormError"));
  assert.ok(adjustmentsPageSource.includes("setActionError"));
  // A posting blocker must never be routed into the table's load-error prop.
  assert.ok(!adjustmentsPageSource.includes("error={error}"));
});

test("adjustments register disables Post when the row cannot be posted", () => {
  assert.ok(adjustmentsPageSource.includes("disabled={row.can_post === false}"));
  assert.ok(adjustmentsPageSource.includes("adjustmentRowBlockerLabel"));
});

test("adjustment form labels the unit cost field and previews line valuation", () => {
  assert.ok(adjustmentsPageSource.includes("Unit cost for this adjustment"));
  assert.ok(adjustmentsPageSource.includes("computeLineValuationPreview"));
  assert.ok(adjustmentsPageSource.includes("No standard cost on this item. Enter unit cost before posting."));
  assert.ok(adjustmentsPageSource.includes("Not available"));
});
