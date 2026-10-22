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

test("collect page wires UnifiedReceivableSearchPanel and AdminUniversalCollectForm", () => {
  assert.ok(collectPageSource.includes("<UnifiedReceivableSearchPanel"));
  assert.ok(collectPageSource.includes("<AdminUniversalCollectForm"));
});

test("collect page wires ReceivableDetailCard and ReceivableWorkbenchPanel", () => {
  assert.ok(collectPageSource.includes("<ReceivableDetailCard"));
  assert.ok(collectPageSource.includes("<ReceivableWorkbenchPanel"));
});

test("collect page handles successful collection and exposes receipt download action", () => {
  assert.ok(collectPageSource.includes("Payment Collected Successfully"));
  assert.ok(collectPageSource.includes("downloadAuthenticatedFile"));
  assert.ok(collectPageSource.includes("Download Receipt PDF"));
});

test("collect page filters finance accounts to active ones for payment collection", () => {
  assert.ok(collectPageSource.includes('for_payment_collection: "true"'));
  assert.ok(collectPageSource.includes("account.is_active"));
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
