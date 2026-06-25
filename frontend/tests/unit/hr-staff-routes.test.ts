/**
 * Phase 7 — HR & Staff separation unit tests.
 *
 * Validates:
 * 1. HR & Staff group contains all HR source workflow routes.
 * 2. HR & Staff group does not include accounting reports, bridge posting,
 *    inventory, purchase, or customer sales routes.
 * 3. /admin/profiles/staff remains under Profiles & Parties as profile alias.
 * 4. Staff self-service routes are not in admin navigation routes.
 * 5. Staff creation/onboarding route does not expose fake payroll/accounting state.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const routesSource = readFileSync(join(thisFileDir, "../../src/lib/routes.ts"), "utf8");
const registrySource = readFileSync(join(thisFileDir, "../../src/config/admin-route-registry.ts"), "utf8");
const taxonomySource = readFileSync(join(thisFileDir, "../../src/config/admin-module-taxonomy.ts"), "utf8");
const staffPageSource = readFileSync(join(thisFileDir, "../../src/app/(dashboard)/admin/hr/staff/page.tsx"), "utf8");

// ── 1. HR route keys exist in ROUTES ─────────────────────────────────────────

test("HR canonical route keys are defined in ROUTES", () => {
  const expectedKeys = ["hr:", "hrStaff:", "hrAttendance:", "hrPayroll:", "hrSalaryPayments:", "hrLeave:", "hrExpenses:", "hrStaffDocuments:"];
  for (const key of expectedKeys) {
    assert.ok(routesSource.includes(key), `Missing route key in ROUTES: ${key}`);
  }
});

test("HR canonical route paths are correct", () => {
  assert.ok(routesSource.includes('"/admin/hr"'), "Missing /admin/hr");
  assert.ok(routesSource.includes('"/admin/hr/staff"'), "Missing /admin/hr/staff");
  assert.ok(routesSource.includes('"/admin/hr/attendance"'), "Missing /admin/hr/attendance");
  assert.ok(routesSource.includes('"/admin/hr/payroll"'), "Missing /admin/hr/payroll");
  assert.ok(routesSource.includes('"/admin/hr/salary-payments"'), "Missing /admin/hr/salary-payments");
  assert.ok(routesSource.includes('"/admin/hr/leave"'), "Missing /admin/hr/leave");
  assert.ok(routesSource.includes('"/admin/hr/expenses"'), "Missing /admin/hr/expenses");
  assert.ok(routesSource.includes('"/admin/hr/staff-documents"'), "Missing /admin/hr/staff-documents");
});

test("/admin/hr/expense-claims compatibility alias page exists", () => {
  const aliasPage = join(thisFileDir, "../../src/app/(dashboard)/admin/hr/expense-claims/page.tsx");
  assert.ok(existsSync(aliasPage), "Missing /admin/hr/expense-claims compatibility alias page");
  const aliasSource = readFileSync(aliasPage, "utf8");
  assert.ok(aliasSource.includes('redirect("/admin/hr/expenses")'), "Expense claims alias must redirect to /admin/hr/expenses");
});

// ── 2. HR & Staff registry group contains all 8 HR source workflow routes ────

test("admin route registry has HR & Staff group with all HR source workflow routes", () => {
  assert.ok(registrySource.includes('"HR & Staff"'), "Missing HR & Staff group in registry");
  assert.ok(registrySource.includes("ROUTES.admin.hr,"), "Missing HR hub in HR & Staff group");
  assert.ok(registrySource.includes("ROUTES.admin.hrStaff,"), "Missing hrStaff in HR & Staff group");
  assert.ok(registrySource.includes("ROUTES.admin.hrAttendance,"), "Missing hrAttendance in HR & Staff group");
  assert.ok(registrySource.includes("ROUTES.admin.hrPayroll,"), "Missing hrPayroll in HR & Staff group");
  assert.ok(registrySource.includes("ROUTES.admin.hrSalaryPayments,"), "Missing hrSalaryPayments in HR & Staff group");
  assert.ok(registrySource.includes("ROUTES.admin.hrLeave,"), "Missing hrLeave in HR & Staff group");
  assert.ok(registrySource.includes("ROUTES.admin.hrExpenses,"), "Missing hrExpenses in HR & Staff group");
  assert.ok(registrySource.includes("ROUTES.admin.hrStaffDocuments,"), "Missing hrStaffDocuments in HR & Staff group");
});

// ── 3. HR & Staff group does NOT include accounting, inventory, or sales routes

test("HR & Staff group does not include accounting bridge or reconciliation routes", () => {
  const lines = registrySource.split("\n");
  const hrGroupStart = lines.findIndex((l) => l.includes('"HR & Staff"'));
  assert.ok(hrGroupStart >= 0, "HR & Staff group not found");

  // Find the end of the HR & Staff block (next group comment or end of tree)
  const nextGroupStart = lines.findIndex((l, i) => i > hrGroupStart && l.includes('"BI & Reports"'));
  const hrBlock = lines.slice(hrGroupStart, nextGroupStart > 0 ? nextGroupStart : hrGroupStart + 30).join("\n");

  const forbiddenRoutes = [
    "accountingBridgeReconciliation",
    "accountingJournals",
    "accountingPeriods",
    "accountingChartOfAccounts",
    "accountingTrialBalance",
    "accountingProfitLoss",
    "accountingBalanceSheet",
    "financeOutstandings",
    "financeCommissions",
    "financePayoutBatches",
    "inventoryItems",
    "inventoryStockOnHand",
    "purchaseOrders",
    "purchaseVendorPayables",
    "salesWorkspace",
    "subscriptions",
  ];

  for (const route of forbiddenRoutes) {
    assert.ok(
      !hrBlock.includes(route),
      `HR & Staff group must not include ${route} — that belongs to a different module`
    );
  }
});

// ── 4. /admin/profiles/staff remains under Profiles & Parties ────────────────

test("/admin/profiles/staff is defined in ROUTES as profilesStaff", () => {
  assert.ok(routesSource.includes("profilesStaff:"), "Missing profilesStaff key in ROUTES");
  assert.ok(routesSource.includes('"/admin/profiles/staff"'), "Missing /admin/profiles/staff path");
});

test("admin route registry has Staff Profiles under Profiles & Parties not HR & Staff", () => {
  assert.ok(registrySource.includes("ROUTES.admin.profilesStaff"), "Missing profilesStaff in registry");

  const lines = registrySource.split("\n");
  const profilesGroupStart = lines.findIndex((l) => l.includes('"Profiles & Parties"'));
  const hrGroupStart = lines.findIndex((l) => l.includes('"HR & Staff"'));
  const profilesGroupEnd = lines.findIndex((l, i) => i > profilesGroupStart && l.includes('"CRM & Requests"'));

  assert.ok(profilesGroupStart >= 0, "Profiles & Parties group not found");
  assert.ok(hrGroupStart >= 0, "HR & Staff group not found");

  // profilesStaff must appear in the Profiles & Parties block, not the HR block
  const profilesBlock = lines.slice(profilesGroupStart, profilesGroupEnd > 0 ? profilesGroupEnd : profilesGroupStart + 30).join("\n");
  assert.ok(profilesBlock.includes("profilesStaff"), "/admin/profiles/staff must be under Profiles & Parties");
});

test("module taxonomy has profiles_parties as owner of /admin/profiles/staff", () => {
  // profiles_parties module should list /admin/profiles/staff in its primaryRoutes
  assert.ok(taxonomySource.includes('"profiles_parties"'), "Missing profiles_parties in taxonomy");
  assert.ok(taxonomySource.includes('"/admin/profiles/staff"'), "Missing /admin/profiles/staff in taxonomy");
});

// ── 5. Staff self-service routes are not in admin navigation ─────────────────

test("staff self-service route paths exist in ROUTES.staff namespace", () => {
  assert.ok(routesSource.includes("staff:"), "Missing staff route namespace");
  assert.ok(routesSource.includes('"/staff"') || routesSource.includes("root: \"/staff\""), "Missing /staff root route");
  assert.ok(routesSource.includes('"/staff/profile"'), "Missing /staff/profile route");
  assert.ok(routesSource.includes('"/staff/attendance"'), "Missing /staff/attendance route");
  assert.ok(routesSource.includes('"/staff/payslips"'), "Missing /staff/payslips route");
  assert.ok(routesSource.includes('"/staff/salary"'), "Missing /staff/salary route");
});

test("staff self-service routes (/staff/*) are not in admin ADMIN_ROUTE_TREE registry", () => {
  // The admin registry should not contain /staff/* self-service paths as navigation items
  const selfServicePaths = ["\"/staff\"", "\"/staff/profile\"", "\"/staff/attendance\"", "\"/staff/payslips\"", "\"/staff/salary\""];
  for (const path of selfServicePaths) {
    assert.ok(
      !registrySource.includes(path),
      `Staff self-service route ${path} must not appear in admin navigation registry`
    );
  }
});

test("admin ROUTES does not expose staff self-service portal routes under admin namespace", () => {
  // /staff/* routes must not appear in the admin.* section of routes.ts
  // They should only appear under the staff: {} namespace
  const adminSection = routesSource.split("staff:")[0]; // Everything before the staff: {} block
  assert.ok(!adminSection.includes('"/staff/payslips"'), "/staff/payslips must not be in admin routes");
  assert.ok(!adminSection.includes('"/staff/profile"'), "/staff/profile must not be in admin routes");
});

// ── 6. HR & Staff taxonomy is correctly classified ───────────────────────────

test("module taxonomy has hr_staff module with correct canonical root", () => {
  assert.ok(taxonomySource.includes('"hr_staff"'), "Missing hr_staff module in taxonomy");
  // canonicalRoot uses ROUTES.admin.hr (a constant reference, not a literal string)
  assert.ok(taxonomySource.includes("ROUTES.admin.hr"), "Missing ROUTES.admin.hr canonical root reference in taxonomy");
  assert.ok(taxonomySource.includes('"payroll"'), "Missing payroll effect type in taxonomy");
});

test("hr_staff taxonomy primaryRoutes includes all 8 HR source workflow routes", () => {
  // The taxonomy primaryRoutes array for hr_staff must contain all HR route constants
  const hrRoutes = [
    "ROUTES.admin.hr,",
    "ROUTES.admin.hrStaff,",
    "ROUTES.admin.hrAttendance,",
    "ROUTES.admin.hrPayroll,",
    "ROUTES.admin.hrSalaryPayments,",
    "ROUTES.admin.hrLeave,",
    "ROUTES.admin.hrExpenses,",
    "ROUTES.admin.hrStaffDocuments",
  ];
  for (const route of hrRoutes) {
    assert.ok(taxonomySource.includes(route), `Missing ${route} in hr_staff taxonomy primaryRoutes`);
  }
});

test("hr_staff taxonomy safety rule mentions payroll accounting separation", () => {
  assert.ok(
    taxonomySource.includes("must not create salary payments") ||
    taxonomySource.includes("must not create") && taxonomySource.includes("payroll accounting"),
    "hr_staff safetyRule must mention that staff creation must not create salary payments or payroll accounting postings"
  );
});

// ── 7. Staff creation page does not expose fake payroll/accounting state ──────

test("admin HR staff page does not reference fake payroll/posted/reconciled status labels", () => {
  // These fake labels must NOT appear on the staff creation page
  const fakeLabels = [
    "Payroll posted",
    "Auto-created payroll",
    "Auto-post salary",
    "Journal auto-posted",
    "Reconciled",
    "Salary auto-generated",
    "Posted/reconciled",
  ];

  for (const label of fakeLabels) {
    assert.ok(
      !staffPageSource.toLowerCase().includes(label.toLowerCase()),
      `Staff creation page must not expose fake label: "${label}"`
    );
  }
});

test("admin HR staff page confirms no payroll/accounting side effects on creation", () => {
  // Must contain at least one explicit note that staff creation doesn't post payroll/accounting
  const safetyIndicators = [
    "never creates payroll",
    "never posts payroll",
    "never create payroll",
    "HR/profile setup only",
    "payroll, journals, money movements",
    "does not create payroll",
    "no payroll",
  ];

  const hasSafetyNote = safetyIndicators.some((indicator) =>
    staffPageSource.toLowerCase().includes(indicator.toLowerCase())
  );
  assert.ok(hasSafetyNote, "Staff creation page must include at least one explicit note that no payroll/accounting records are created");
});

test("admin HR staff page uses correct action labels (no fake activate-with-payroll label)", () => {
  // Required state-based action labels must be present
  assert.ok(staffPageSource.includes("Save draft") || staffPageSource.includes("Save Draft"), "Missing 'Save draft' action label");
  assert.ok(staffPageSource.includes("Save onboarding") || staffPageSource.includes("Save Onboarding"), "Missing 'Save onboarding' action label");
  assert.ok(staffPageSource.includes("Activate staff") || staffPageSource.includes("Activate Staff"), "Missing 'Activate staff' action label");
});

// ── 8. Accounting & Reconciliation does not own HR source workflow routes ─────

test("Accounting & Reconciliation group does not own HR source workflow routes", () => {
  const lines = registrySource.split("\n");
  const accGroupStart = lines.findIndex((l) => l.includes('"Accounting & Reconciliation"'));
  const nextGroupStart = lines.findIndex((l, i) => i > accGroupStart && l.includes('"Inventory & Stock"'));

  assert.ok(accGroupStart >= 0, "Accounting & Reconciliation group not found");

  const accBlock = lines.slice(accGroupStart, nextGroupStart > 0 ? nextGroupStart : accGroupStart + 40).join("\n");

  const hrSourceRoutes = ["hrStaff", "hrAttendance", "hrPayroll", "hrLeave", "hrExpenses", "hrStaffDocuments"];
  for (const route of hrSourceRoutes) {
    assert.ok(
      !accBlock.includes(route),
      `Accounting & Reconciliation must not own HR source route: ${route}`
    );
  }
});
