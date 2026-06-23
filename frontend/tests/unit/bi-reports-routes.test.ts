/**
 * Phase 8 — BI & Reports / Business Optimization unit tests.
 *
 * Validates:
 * 1. BI & Reports group owns all BI/report/analytics routes in the taxonomy.
 * 2. BI & Reports group owns all BI/report/analytics routes in the registry.
 * 3. BI & Reports group excludes accounting setup, bridge posting, COA, journals,
 *    collection creation, stock adjustment, payroll payment, and period close routes.
 * 4. Accounting statutory reports (TB, P&L, BS) remain under Accounting & Reconciliation.
 * 5. BI taxonomy has read_only effect and read_only_bi UI pattern.
 * 6. Batch performance report page does not contain unsafe mutation action labels.
 * 7. Collections report page is not a re-export of the revenue page.
 * 8. Risk monitor and churn analysis pages carry Read-only BI labels.
 * 9. Analytics routes are classified under BI & Reports (not a separate module).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const routesSource = readFileSync(join(thisFileDir, "../../src/lib/routes.ts"), "utf8");
const registrySource = readFileSync(join(thisFileDir, "../../src/config/admin-route-registry.ts"), "utf8");
const taxonomySource = readFileSync(join(thisFileDir, "../../src/config/admin-module-taxonomy.ts"), "utf8");

const biPageDir = join(thisFileDir, "../../src/app/(dashboard)/admin/bi");
const reportsPageDir = join(thisFileDir, "../../src/app/(dashboard)/admin/reports");
const analyticsPageDir = join(thisFileDir, "../../src/app/(dashboard)/admin/analytics");

/**
 * Extract the bi_reports module DEFINITION block from the taxonomy source.
 * Uses `key: "bi_reports"` (not the bare `"bi_reports"` which also matches the
 * AdminCanonicalModule type union at the top of the file) and bounds the block
 * by the next module key, falling back to end of file.
 */
function biReportsModuleBlock(): string {
  const start = taxonomySource.indexOf('key: "bi_reports"');
  if (start < 0) return "";
  const next = taxonomySource.indexOf('key: "settings_governance"', start);
  return taxonomySource.slice(start, next > 0 ? next : taxonomySource.length);
}

// ── 1. ROUTES — all BI/report/analytics route constants exist ─────────────────

test("BI route keys are defined in ROUTES", () => {
  const expectedKeys = [
    "bi:", "biProfitability:", "biCustomers:", "biBatches:", "biCashflow:", "biInventory:", "biHr:",
    "reportsCenter:", "reports:",
    "reportsRevenue:", "reportsCollections:", "reportsOverdue:",
    "reportsCustomerAnalytics:", "reportsBatchPerformance:", "reportsPartners:", "reportsWaiverLoss:",
    "analytics:", "analyticsRiskMonitor:", "analyticsChurnAnalysis:",
  ];
  for (const key of expectedKeys) {
    assert.ok(routesSource.includes(key), `Missing route key in ROUTES: ${key}`);
  }
});

test("BI route paths are correct in ROUTES", () => {
  assert.ok(routesSource.includes('"/admin/bi"'), "Missing /admin/bi");
  assert.ok(routesSource.includes('"/admin/bi/profitability"'), "Missing /admin/bi/profitability");
  assert.ok(routesSource.includes('"/admin/bi/customers"'), "Missing /admin/bi/customers");
  assert.ok(routesSource.includes('"/admin/bi/batches"'), "Missing /admin/bi/batches");
  assert.ok(routesSource.includes('"/admin/bi/cashflow"'), "Missing /admin/bi/cashflow");
  assert.ok(routesSource.includes('"/admin/bi/inventory"'), "Missing /admin/bi/inventory");
  assert.ok(routesSource.includes('"/admin/bi/hr"'), "Missing /admin/bi/hr");
  assert.ok(routesSource.includes('"/admin/reports"'), "Missing /admin/reports");
  assert.ok(routesSource.includes('"/admin/reports"'), "Missing /admin/reports");
  assert.ok(routesSource.includes('"/admin/reports/revenue"'), "Missing /admin/reports/revenue");
  assert.ok(routesSource.includes('"/admin/reports/collections"'), "Missing /admin/reports/collections");
  assert.ok(routesSource.includes('"/admin/reports/overdue"'), "Missing /admin/reports/overdue");
  assert.ok(routesSource.includes('"/admin/reports/customer-analytics"'), "Missing /admin/reports/customer-analytics");
  assert.ok(routesSource.includes('"/admin/reports/batch-performance"'), "Missing /admin/reports/batch-performance");
  assert.ok(routesSource.includes('"/admin/reports/partners"'), "Missing /admin/reports/partners");
  assert.ok(routesSource.includes('"/admin/reports/waiver-loss"'), "Missing /admin/reports/waiver-loss");
  assert.ok(routesSource.includes('"/admin/analytics"'), "Missing /admin/analytics");
  assert.ok(routesSource.includes('"/admin/analytics/risk-monitor"'), "Missing /admin/analytics/risk-monitor");
  assert.ok(routesSource.includes('"/admin/analytics/churn-analysis"'), "Missing /admin/analytics/churn-analysis");
});

// ── 2. Taxonomy — bi_reports module classification ───────────────────────────

test("module taxonomy has bi_reports module", () => {
  assert.ok(taxonomySource.includes('"bi_reports"'), "Missing bi_reports module in taxonomy");
});

test("bi_reports taxonomy has read_only effect", () => {
  const biBlock = biReportsModuleBlock();
  assert.ok(biBlock.length > 0, "bi_reports module block not found in taxonomy");
  assert.ok(biBlock.includes('effect: "read_only"'), "bi_reports must have effect: read_only");
});

test("bi_reports taxonomy has read_only_bi UI pattern", () => {
  const biBlock = biReportsModuleBlock();
  assert.ok(biBlock.length > 0, "bi_reports module block not found in taxonomy");
  assert.ok(biBlock.includes('uiPattern: "read_only_bi"'), "bi_reports must have uiPattern: read_only_bi");
});

test("bi_reports taxonomy primaryRoutes includes all BI sub-routes", () => {
  const biBlock = biReportsModuleBlock();
  assert.ok(biBlock.length > 0, "bi_reports module block not found in taxonomy");

  const requiredRoutes = [
    "ROUTES.admin.bi,",
    "ROUTES.admin.biProfitability,",
    "ROUTES.admin.biCustomers,",
    "ROUTES.admin.biBatches,",
    "ROUTES.admin.biCashflow,",
    "ROUTES.admin.biInventory,",
    "ROUTES.admin.biHr,",
    "ROUTES.admin.reportsCenter,",
    "ROUTES.admin.reports,",
    "ROUTES.admin.reportsRevenue,",
    "ROUTES.admin.reportsCollections,",
    "ROUTES.admin.reportsOverdue,",
    "ROUTES.admin.reportsCustomerAnalytics,",
    "ROUTES.admin.reportsBatchPerformance,",
    "ROUTES.admin.reportsPartners,",
    "ROUTES.admin.reportsWaiverLoss,",
    "ROUTES.admin.analytics,",
    "ROUTES.admin.analyticsRiskMonitor,",
    "ROUTES.admin.analyticsChurnAnalysis,",
  ];
  for (const route of requiredRoutes) {
    assert.ok(biBlock.includes(route), `bi_reports taxonomy must include ${route}`);
  }
});

test("bi_reports taxonomy safety rule mentions read-only and no mutation", () => {
  const biBlock = biReportsModuleBlock();
  assert.ok(biBlock.length > 0, "bi_reports module block not found in taxonomy");
  assert.ok(
    biBlock.includes("never mutate") || biBlock.includes("Read-only") || biBlock.includes("read-only"),
    "bi_reports safetyRule must mention read-only / no mutation"
  );
});

// ── 3. Registry — BI & Reports group owns all BI/report/analytics routes ──────

test("admin route registry has BI & Reports group", () => {
  assert.ok(registrySource.includes('"BI & Reports"'), "Missing BI & Reports group in registry");
});

test("BI & Reports registry group includes all BI dashboard routes", () => {
  const lines = registrySource.split("\n");
  const biStart = lines.findIndex((l) => l.includes('"BI & Reports"'));
  assert.ok(biStart >= 0, "BI & Reports group not found");
  const nextGroupStart = lines.findIndex((l, i) => i > biStart && l.includes('"Settings & Governance"'));
  const biBlock = lines.slice(biStart, nextGroupStart > 0 ? nextGroupStart : lines.length).join("\n");

  const requiredRoutes = [
    "ROUTES.admin.bi,",
    "ROUTES.admin.biProfitability,",
    "ROUTES.admin.biCustomers,",
    "ROUTES.admin.biBatches,",
    "ROUTES.admin.biCashflow,",
    "ROUTES.admin.biInventory,",
    "ROUTES.admin.biHr,",
    "ROUTES.admin.reportsCenter,",
    "ROUTES.admin.reports,",
    "ROUTES.admin.reportsRevenue,",
    "ROUTES.admin.reportsCollections,",
    "ROUTES.admin.reportsOverdue,",
    "ROUTES.admin.reportsCustomerAnalytics,",
    "ROUTES.admin.reportsBatchPerformance,",
    "ROUTES.admin.reportsPartners,",
    "ROUTES.admin.reportsWaiverLoss,",
    "ROUTES.admin.analytics,",
    "ROUTES.admin.analyticsRiskMonitor,",
    "ROUTES.admin.analyticsChurnAnalysis,",
  ];
  for (const route of requiredRoutes) {
    assert.ok(biBlock.includes(route), `BI & Reports group must include ${route}`);
  }
});

// ── 4. BI & Reports group excludes accounting, collections, stock, payroll ────

test("BI & Reports group does not include accounting setup, bridge, COA, or journal routes", () => {
  const lines = registrySource.split("\n");
  const biStart = lines.findIndex((l) => l.includes('"BI & Reports"'));
  assert.ok(biStart >= 0, "BI & Reports group not found");
  const nextGroupStart = lines.findIndex((l, i) => i > biStart && l.includes('"Settings & Governance"'));
  const biBlock = lines.slice(biStart, nextGroupStart > 0 ? nextGroupStart : lines.length).join("\n");

  const forbiddenRoutes = [
    "accountingSetup",
    "accountingChartOfAccounts",
    "accountingJournals",
    "accountingBridgeReconciliation",
    "accountingPeriods",
    "financeCollect",
    "inventoryAdjustments",
    "hrSalaryPayments",
    "purchaseVendorPayments",
  ];
  for (const route of forbiddenRoutes) {
    assert.ok(
      !biBlock.includes(route),
      `BI & Reports group must NOT include ${route}`
    );
  }
});

// ── 5. Accounting statutory reports remain under Accounting & Reconciliation ──

test("Accounting & Reconciliation group owns Trial Balance, P&L, Balance Sheet", () => {
  const lines = registrySource.split("\n");
  const acctStart = lines.findIndex((l) => l.includes('"Accounting & Reconciliation"'));
  assert.ok(acctStart >= 0, "Accounting & Reconciliation group not found");
  const nextGroupStart = lines.findIndex((l, i) => i > acctStart && l.includes('"Inventory & Stock"'));
  const acctBlock = lines.slice(acctStart, nextGroupStart > 0 ? nextGroupStart : acctStart + 60).join("\n");

  assert.ok(acctBlock.includes("accountingTrialBalance"), "Accounting & Reconciliation must own Trial Balance");
  assert.ok(acctBlock.includes("accountingProfitLoss"), "Accounting & Reconciliation must own P&L");
  assert.ok(acctBlock.includes("accountingBalanceSheet"), "Accounting & Reconciliation must own Balance Sheet");
});

test("Trial Balance, P&L, Balance Sheet are NOT in BI & Reports group", () => {
  const lines = registrySource.split("\n");
  const biStart = lines.findIndex((l) => l.includes('"BI & Reports"'));
  assert.ok(biStart >= 0, "BI & Reports group not found");
  const nextGroupStart = lines.findIndex((l, i) => i > biStart && l.includes('"Settings & Governance"'));
  const biBlock = lines.slice(biStart, nextGroupStart > 0 ? nextGroupStart : lines.length).join("\n");

  assert.ok(!biBlock.includes("accountingTrialBalance"), "Trial Balance must NOT be in BI & Reports");
  assert.ok(!biBlock.includes("accountingProfitLoss"), "P&L must NOT be in BI & Reports");
  assert.ok(!biBlock.includes("accountingBalanceSheet"), "Balance Sheet must NOT be in BI & Reports");
});

// ── 6. Page files exist for all required BI/report/analytics routes ───────────

test("BI page files exist for all /admin/bi/* routes", () => {
  const pages = [
    "page.tsx",
    "profitability/page.tsx",
    "customers/page.tsx",
    "batches/page.tsx",
    "cashflow/page.tsx",
    "inventory/page.tsx",
    "hr/page.tsx",
  ];
  for (const p of pages) {
    assert.ok(existsSync(join(biPageDir, p)), `Missing BI page: /admin/bi/${p}`);
  }
});

test("Report page files exist for all /admin/reports/* routes", () => {
  const pages = [
    "page.tsx",
    "revenue/page.tsx",
    "collections/page.tsx",
    "overdue/page.tsx",
    "customer-analytics/page.tsx",
    "batch-performance/page.tsx",
    "partners/page.tsx",
    "waiver-loss/page.tsx",
  ];
  for (const p of pages) {
    assert.ok(existsSync(join(reportsPageDir, p)), `Missing report page: /admin/reports/${p}`);
  }
});

test("customer-analytics report links each row to customer profile detail", () => {
  const source = readFileSync(join(reportsPageDir, "customer-analytics/page.tsx"), "utf8");
  assert.ok(
    source.includes("ROUTES.admin.customers") || source.includes("/admin/customers/"),
    "customer-analytics page must link to customer profile routes"
  );
  assert.ok(
    source.includes("<Link") || source.includes("href={`${ROUTES.admin.customers}"),
    "customer-analytics page must use a navigable row action link"
  );
});

test("Analytics page files exist for all /admin/analytics/* routes", () => {
  assert.ok(existsSync(join(analyticsPageDir, "page.tsx")), "Missing /admin/analytics/page.tsx");
  assert.ok(existsSync(join(analyticsPageDir, "risk-monitor/page.tsx")), "Missing /admin/analytics/risk-monitor/page.tsx");
  assert.ok(existsSync(join(analyticsPageDir, "churn-analysis/page.tsx")), "Missing /admin/analytics/churn-analysis/page.tsx");
});

// ── 7. Batch performance page does not contain unsafe mutation labels ──────────

test("batch-performance report page does not contain Edit mutation action", () => {
  const source = readFileSync(join(reportsPageDir, "batch-performance/page.tsx"), "utf8");
  const unsafeLabels = [
    ">Edit<",
    '"Edit"',
    "label: \"Edit\"",
    "/edit\"",
  ];
  for (const label of unsafeLabels) {
    assert.ok(
      !source.includes(label),
      `Batch performance BI page must not include mutation label: ${label}`
    );
  }
});

test("batch-performance report page has source-linked report status badge or read-only label", () => {
  const source = readFileSync(join(reportsPageDir, "batch-performance/page.tsx"), "utf8");
  assert.ok(
    source.includes("Source-linked report") || source.includes("Read-only") || source.includes("Decision support"),
    "Batch performance page must include a read-only / source-linked / decision support label"
  );
});

test("batch-performance report page does not claim to post, sync, or reconcile", () => {
  const source = readFileSync(join(reportsPageDir, "batch-performance/page.tsx"), "utf8");
  const unsafeCopy = [
    "Post bridge",
    "Sync accounting",
    "Reconcile",
    "Mark complete",
    "Close period",
    "Create payment",
    "Collect payment",
  ];
  for (const copy of unsafeCopy) {
    assert.ok(
      !source.toLowerCase().includes(copy.toLowerCase()),
      `Batch performance page must not imply mutation: "${copy}"`
    );
  }
});

// ── 8. Collections report page is not a re-export of revenue page ─────────────

test("collections report page is not a re-export of the revenue page", () => {
  const source = readFileSync(join(reportsPageDir, "collections/page.tsx"), "utf8");
  assert.ok(
    !source.includes("RevenueReportPage"),
    "collections/page.tsx must not re-export or import RevenueReportPage"
  );
  assert.ok(
    !source.includes("from \"@/app/(dashboard)/admin/reports/revenue/page\""),
    "collections/page.tsx must not import from revenue/page"
  );
});

test("collections report page has its own collection-specific content", () => {
  const source = readFileSync(join(reportsPageDir, "collections/page.tsx"), "utf8");
  assert.ok(
    source.includes("Collections") || source.includes("collection"),
    "collections report page must have collection-specific content"
  );
  assert.ok(
    source.includes("Source-linked report") || source.includes("Read-only") || source.includes("Decision support"),
    "collections report page must include a read-only / source-linked / decision support label"
  );
});

// ── 9. Risk monitor and churn analysis carry Read-only BI labels ──────────────

test("risk-monitor page has Read-only BI status badge", () => {
  const source = readFileSync(join(analyticsPageDir, "risk-monitor/page.tsx"), "utf8");
  assert.ok(
    source.includes("Read-only BI") || source.includes("Read Only") || source.includes("Source-linked"),
    "risk-monitor page must include a Read-only BI label"
  );
});

test("risk-monitor page does not contain unsafe mutation labels", () => {
  const source = readFileSync(join(analyticsPageDir, "risk-monitor/page.tsx"), "utf8");
  const unsafeCopy = [
    "Post bridge",
    "Reconcile",
    "Create payment",
    "Collect payment",
    "Mark complete",
    "Close period",
  ];
  for (const copy of unsafeCopy) {
    assert.ok(
      !source.toLowerCase().includes(copy.toLowerCase()),
      `risk-monitor page must not imply mutation: "${copy}"`
    );
  }
});

test("churn-analysis page has Read-only BI status badge", () => {
  const source = readFileSync(join(analyticsPageDir, "churn-analysis/page.tsx"), "utf8");
  assert.ok(
    source.includes("Read-only BI") || source.includes("Read Only") || source.includes("Source-linked"),
    "churn-analysis page must include a Read-only BI label"
  );
});

test("churn-analysis page does not contain unsafe mutation labels", () => {
  const source = readFileSync(join(analyticsPageDir, "churn-analysis/page.tsx"), "utf8");
  const unsafeCopy = [
    "Post bridge",
    "Reconcile",
    "Create payment",
    "Collect payment",
    "Mark complete",
    "Close period",
  ];
  for (const copy of unsafeCopy) {
    assert.ok(
      !source.toLowerCase().includes(copy.toLowerCase()),
      `churn-analysis page must not imply mutation: "${copy}"`
    );
  }
});

// ── 10. Analytics routes are classified under BI & Reports in taxonomy ─────────

test("analytics routes are owned by bi_reports module in taxonomy primaryRoutes", () => {
  const biBlock = biReportsModuleBlock();
  assert.ok(biBlock.length > 0, "bi_reports module block not found in taxonomy");

  assert.ok(biBlock.includes("ROUTES.admin.analytics,"), "bi_reports must include ROUTES.admin.analytics");
  assert.ok(biBlock.includes("ROUTES.admin.analyticsRiskMonitor,"), "bi_reports must include analyticsRiskMonitor");
  assert.ok(biBlock.includes("ROUTES.admin.analyticsChurnAnalysis,"), "bi_reports must include analyticsChurnAnalysis");
});

test("analytics routes are NOT owned by accounting_reconciliation module", () => {
  const acctStart = taxonomySource.indexOf('key: "accounting_reconciliation"');
  assert.ok(acctStart >= 0, "accounting_reconciliation module not found in taxonomy");
  const acctNext = taxonomySource.indexOf('key: "inventory_stock"', acctStart);
  const acctBlock = taxonomySource.slice(acctStart, acctNext > 0 ? acctNext : acctStart + 2000);

  assert.ok(!acctBlock.includes("analytics"), "accounting_reconciliation must not own analytics routes");
  assert.ok(!acctBlock.includes("biProfitability"), "accounting_reconciliation must not own BI profitability");
  assert.ok(!acctBlock.includes("reportsRevenue"), "accounting_reconciliation must not own reportsRevenue");
});
