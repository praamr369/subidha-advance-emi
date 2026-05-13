import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();

const directSaleSource = readFileSync(
  join(rootDir, "src/app/(dashboard)/admin/billing/direct-sale/DirectSaleWorkspace.tsx"),
  "utf8"
);
const purchaseBillsSource = readFileSync(
  join(rootDir, "src/app/(dashboard)/admin/accounting/purchase-bills/page.tsx"),
  "utf8"
);
const complianceTaxProfileSource = readFileSync(
  join(rootDir, "src/app/(dashboard)/admin/compliance/tax-profile/page.tsx"),
  "utf8"
);
const adminLayoutSource = readFileSync(
  join(rootDir, "src/app/(dashboard)/admin/layout.tsx"),
  "utf8"
);

test("admin compliance tax profile page defaults to GST_UNREGISTERED mode", () => {
  assert.ok(complianceTaxProfileSource.includes('"GST_UNREGISTERED"'));
  assert.ok(complianceTaxProfileSource.includes("GST Unregistered"));
});

test("direct-sale workspace exposes commercial invoice non-gst mode and hides gst option in unregistered mode", () => {
  assert.ok(directSaleSource.includes("Commercial Invoice / Non-GST"));
  assert.ok(directSaleSource.includes('!isNonGstBusiness ? <option value="GST">GST</option> : null'));
});

test("purchase bills workspace shows itc blocked posture in non-gst mode", () => {
  assert.ok(purchaseBillsSource.includes("ITC claimable:"));
  assert.ok(purchaseBillsSource.includes("Supplier GST can be captured on purchase lines"));
  assert.ok(purchaseBillsSource.includes("getComplianceTaxProfile"));
});

test("admin routes remain role-guarded", () => {
  assert.ok(adminLayoutSource.includes("RoleGuard allowedRoles={[\"ADMIN\"]}"));
});
