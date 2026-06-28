import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const routesSource = readFileSync(join(thisFileDir, "../../src/lib/routes.ts"), "utf8");
const registrySource = readFileSync(join(thisFileDir, "../../src/config/admin-route-registry.ts"), "utf8");
const taxonomySource = readFileSync(join(thisFileDir, "../../src/config/admin-module-taxonomy.ts"), "utf8");

const financeAppRoot = join(thisFileDir, "../../src/app/(dashboard)/admin/finance");
const accountingAppRoot = join(thisFileDir, "../../src/app/(dashboard)/admin/accounting");
const bridgeReconciliationPage = join(accountingAppRoot, "bridge-reconciliation/page.tsx");
const legacyPaymentListPage = join(thisFileDir, "../../src/modules/payments/pages/AdminPaymentListPage.tsx");

// ── Phase 4: canonical Finance Operations route constants ─────────────────────

test("financeOutstandings canonical route constant is defined in ROUTES", () => {
  assert.ok(routesSource.includes("financeOutstandings:"), "Missing financeOutstandings route key");
  assert.ok(routesSource.includes('"/admin/finance/outstandings"'), "Missing /admin/finance/outstandings path");
});

test("financeCustomerAdvances canonical route constant is defined in ROUTES", () => {
  assert.ok(routesSource.includes("financeCustomerAdvances:"), "Missing financeCustomerAdvances route key");
  assert.ok(routesSource.includes('"/admin/finance/customer-advances"'), "Missing /admin/finance/customer-advances path");
});

test("financeCustomerCredits canonical route constant is defined in ROUTES", () => {
  assert.ok(routesSource.includes("financeCustomerCredits:"), "Missing financeCustomerCredits route key");
  assert.ok(routesSource.includes('"/admin/finance/customer-credits"'), "Missing /admin/finance/customer-credits path");
});

// ── Finance Operations alias pages exist ──────────────────────────────────────

test("/admin/finance/outstandings alias page file exists", () => {
  assert.ok(
    existsSync(join(financeAppRoot, "outstandings/page.tsx")),
    "Missing /admin/finance/outstandings/page.tsx"
  );
});

test("/admin/finance/customer-advances alias page file exists", () => {
  assert.ok(
    existsSync(join(financeAppRoot, "customer-advances/page.tsx")),
    "Missing /admin/finance/customer-advances/page.tsx"
  );
});

test("/admin/finance/outstandings page redirects to /admin/outstandings", () => {
  const page = readFileSync(join(financeAppRoot, "outstandings/page.tsx"), "utf8");
  assert.ok(page.includes('redirect("/admin/outstandings")'), "outstandings alias must redirect to /admin/outstandings");
});

test("/admin/finance/customer-advances page redirects to /admin/customer-advances", () => {
  const page = readFileSync(join(financeAppRoot, "customer-advances/page.tsx"), "utf8");
  assert.ok(
    page.includes('redirect("/admin/customer-advances")'),
    "customer-advances alias must redirect to /admin/customer-advances"
  );
});

test("legacy payment register includes CARD filter option", () => {
  const page = readFileSync(legacyPaymentListPage, "utf8");
  assert.ok(page.includes('<option value="CARD">CARD</option>'), "Payment list filter must expose CARD");
  assert.ok(
    page.includes('<ToggleGroupItem value="CARD">Card</ToggleGroupItem>'),
    "Payment quick filter must expose CARD"
  );
});

// ── Old routes still exist (backward compat) ──────────────────────────────────

test("legacy /admin/outstandings page file still exists", () => {
  const outstandingsRoot = join(thisFileDir, "../../src/app/(dashboard)/admin/outstandings");
  assert.ok(existsSync(join(outstandingsRoot, "page.tsx")), "Legacy /admin/outstandings/page.tsx must remain");
});

// ── Accounting canonical route still exists ───────────────────────────────────

test("/admin/accounting/bridge-reconciliation page file exists", () => {
  assert.ok(
    existsSync(bridgeReconciliationPage),
    "Missing /admin/accounting/bridge-reconciliation/page.tsx"
  );
});

test("bridge reconciliation treats StaffAdvance as a supported backend source", () => {
  const page = readFileSync(bridgeReconciliationPage, "utf8");
  assert.ok(page.includes('{ value: "StaffAdvance", label: "Staff Advance" }'));
  assert.ok(
    !page.includes('if (workflow.source_model === "StaffAdvance") return "UNSUPPORTED_BOUNDARY";'),
    "StaffAdvance status must come from the backend reconciliation payload"
  );
});

// ── Finance Operations registry group — only Finance source routes ────────────

test("Finance Operations registry group uses canonical financeOutstandings route", () => {
  const lines = registrySource.split("\n");
  const financeStart = lines.findIndex((l) => l.includes('"Finance Operations"'));
  assert.ok(financeStart !== -1, "Finance Operations group not found in registry");

  let financeEnd = lines.length;
  for (let i = financeStart + 1; i < lines.length; i++) {
    if (/\/\/ ── \d+\./.test(lines[i])) {
      financeEnd = i;
      break;
    }
  }

  const block = lines.slice(financeStart, financeEnd).join("\n");
  assert.ok(block.includes("financeOutstandings"), "Finance Operations group must include financeOutstandings");
  assert.ok(block.includes("financeCustomerCredits"), "Finance Operations group must include financeCustomerCredits");
  assert.ok(block.includes("financeCustomerAdvances"), "Finance Operations group must include financeCustomerAdvances");
});

test("Finance Operations registry group does not include COA, journals, or periods", () => {
  const lines = registrySource.split("\n");
  const financeStart = lines.findIndex((l) => l.includes('"Finance Operations"'));
  assert.ok(financeStart !== -1, "Finance Operations group not found in registry");

  let financeEnd = lines.length;
  for (let i = financeStart + 1; i < lines.length; i++) {
    if (/\/\/ ── \d+\./.test(lines[i])) {
      financeEnd = i;
      break;
    }
  }

  const block = lines.slice(financeStart, financeEnd).join("\n");
  assert.ok(
    !block.includes("accountingChartOfAccounts"),
    "Finance Operations group must not include COA (accountingChartOfAccounts)"
  );
  assert.ok(
    !block.includes("accountingJournals"),
    "Finance Operations group must not include Journals (accountingJournals)"
  );
  assert.ok(
    !block.includes("accountingPeriods"),
    "Finance Operations group must not include Periods (accountingPeriods)"
  );
  assert.ok(
    !block.includes("accountingTrialBalance"),
    "Finance Operations group must not include Trial Balance"
  );
  assert.ok(
    !block.includes("accountingProfitLoss"),
    "Finance Operations group must not include P&L"
  );
  assert.ok(
    !block.includes("accountingBalanceSheet"),
    "Finance Operations group must not include Balance Sheet"
  );
});

// ── Accounting & Reconciliation registry group — only ledger/accounting routes ─

test("Accounting & Reconciliation registry group includes canonical bridge-reconciliation", () => {
  const lines = registrySource.split("\n");
  const acctStart = lines.findIndex((l) => l.includes('"Accounting & Reconciliation"'));
  assert.ok(acctStart !== -1, "Accounting & Reconciliation group not found in registry");

  let acctEnd = lines.length;
  for (let i = acctStart + 1; i < lines.length; i++) {
    if (/\/\/ ── \d+\./.test(lines[i])) {
      acctEnd = i;
      break;
    }
  }

  const block = lines.slice(acctStart, acctEnd).join("\n");
  assert.ok(
    block.includes("financeCanonicalReconciliation"),
    "Accounting & Reconciliation group must include financeCanonicalReconciliation"
  );
  assert.ok(
    block.includes("accountingChartOfAccounts"),
    "Accounting & Reconciliation group must include COA"
  );
  assert.ok(
    block.includes("accountingJournals"),
    "Accounting & Reconciliation group must include journals"
  );
  assert.ok(
    block.includes("accountingPeriods"),
    "Accounting & Reconciliation group must include periods"
  );
  assert.ok(
    block.includes("accountingTrialBalance"),
    "Accounting & Reconciliation group must include trial balance"
  );
  assert.ok(
    block.includes("accountingProfitLoss"),
    "Accounting & Reconciliation group must include P&L"
  );
  assert.ok(
    block.includes("accountingBalanceSheet"),
    "Accounting & Reconciliation group must include balance sheet"
  );
});

test("Accounting & Reconciliation group does not include collection/deposit source operations", () => {
  const lines = registrySource.split("\n");
  const acctStart = lines.findIndex((l) => l.includes('"Accounting & Reconciliation"'));
  assert.ok(acctStart !== -1, "Accounting & Reconciliation group not found in registry");

  let acctEnd = lines.length;
  for (let i = acctStart + 1; i < lines.length; i++) {
    if (/\/\/ ── \d+\./.test(lines[i])) {
      acctEnd = i;
      break;
    }
  }

  const block = lines.slice(acctStart, acctEnd).join("\n");
  // Collections and cashier workflows must NOT be in Accounting & Reconciliation
  assert.ok(
    !block.includes("financeCollect"),
    "Accounting & Reconciliation must not include financeCollect (collection source operation)"
  );
  assert.ok(
    !block.includes("settlements"),
    "Accounting & Reconciliation must not include settlements source operation"
  );
});

// ── financeCanonicalReconciliation points to accounting bridge-reconciliation ──

test("financeCanonicalReconciliation route constant points to accounting bridge-reconciliation", () => {
  assert.ok(
    routesSource.includes('financeCanonicalReconciliation: "/admin/accounting/bridge-reconciliation"'),
    "financeCanonicalReconciliation must resolve to /admin/accounting/bridge-reconciliation"
  );
});

// ── Module taxonomy — Finance Operations primaryRoutes ────────────────────────

test("finance_operations taxonomy module includes canonical Phase 4 routes", () => {
  assert.ok(
    taxonomySource.includes("financeOutstandings"),
    "finance_operations taxonomy must include financeOutstandings"
  );
  assert.ok(
    taxonomySource.includes("financeCustomerAdvances"),
    "finance_operations taxonomy must include financeCustomerAdvances"
  );
});

// ── Documented gaps for Phase 4 ───────────────────────────────────────────────

test("/admin/finance/customer-credits is now implemented as a finance source surface", () => {
  const customerCreditsPath = join(financeAppRoot, "customer-credits/page.tsx");
  assert.ok(existsSync(customerCreditsPath), "/admin/finance/customer-credits/page.tsx must exist");
  const page = readFileSync(customerCreditsPath, "utf8");
  assert.ok(page.includes("Customer Credits"), "customer-credits page must expose customer credits wording");
  assert.ok(page.includes("listCustomerCredits"), "customer-credits page must use the customer-credits list API");
  assert.ok(page.includes("createCustomerCredit"), "customer-credits page must use the customer-credits create API");
});

test("/admin/finance/refunds is a focused view over audited reversal control", () => {
  const refundsPath = join(financeAppRoot, "refunds/page.tsx");
  assert.ok(existsSync(refundsPath), "/admin/finance/refunds page must exist");
  const page = readFileSync(refundsPath, "utf8");
  assert.ok(page.includes("listReversalCases"), "refunds must reuse audited reversal-control cases");
  assert.ok(page.includes("financeReversalControl"), "refunds must link back to reversal control");
});
