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
const adminShellRouterSource = readFileSync(
  join(rootDir, "src/components/layout/AdminShellRouter.tsx"),
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
  // The admin layout no longer inlines the guard; it delegates the whole admin
  // route group to AdminShellRouter, which is where ADMIN-only protection now lives.
  assert.ok(adminLayoutSource.includes("AdminShellRouter"));

  // AdminShellRouter must wrap every admin route (both the print and shell
  // branches) in RoleGuard restricted to the ADMIN role. Assert the real
  // current mechanism rather than a string the layout no longer contains.
  assert.ok(adminShellRouterSource.includes('import RoleGuard from "@/components/guards/RoleGuard"'));
  assert.ok(adminShellRouterSource.includes("allowedRoles={[\"ADMIN\"]}"));
});
