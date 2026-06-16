/**
 * Phase 5 — Inventory + Purchase + Vendor chain route tests.
 *
 * Validates:
 * - Inventory & Stock group contains only stock-truth routes (no vendor payables, purchase bills, journals, reconciliation).
 * - Purchases & Vendors group contains the full purchase chain including vendor payables and vendor payments.
 * - Purchases & Vendors group does not include customer sales, EMI subscriptions, or accounting reports.
 * - Vendor profile canonical route remains under Profiles & Parties.
 * - /admin/vendors procurement register is in Purchases & Vendors (keep_temporarily).
 * - Manufacturing remains separate/deferred — not merged into Purchases & Vendors.
 * - Phase 5 taxonomy primaryRoutes are present.
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

const appRoot = join(thisFileDir, "../../src/app/(dashboard)/admin");

// ── Helper: extract a group block from the registry ──────────────────────────

function extractGroupBlock(source: string, groupLabel: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.includes(`"${groupLabel}"`));
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/\/\/ ── \d+\./.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

// ── Inventory & Stock — route constants ──────────────────────────────────────

test("Phase 5: inventory route constants include all required paths", () => {
  assert.ok(routesSource.includes('inventoryProfiles:'), "Missing inventoryProfiles route key");
  assert.ok(routesSource.includes('inventoryOpeningStock:'), "Missing inventoryOpeningStock route key");
  assert.ok(routesSource.includes('inventoryDemandPlanning:'), "Missing inventoryDemandPlanning route key");
  assert.ok(routesSource.includes('inventoryPurchaseNeeds:'), "Missing inventoryPurchaseNeeds route key");
  assert.ok(routesSource.includes('inventoryReadiness:'), "Missing inventoryReadiness route key");
  assert.ok(routesSource.includes('inventoryValuation:'), "Missing inventoryValuation route key");
});

// ── Inventory & Stock — taxonomy primaryRoutes ────────────────────────────────

test("Phase 5: inventory_stock taxonomy includes all Phase 5 required routes", () => {
  assert.ok(taxonomySource.includes("inventoryProfiles"), "inventory_stock taxonomy missing inventoryProfiles");
  assert.ok(taxonomySource.includes("inventoryOpeningStock"), "inventory_stock taxonomy missing inventoryOpeningStock");
  assert.ok(taxonomySource.includes("inventoryDemandPlanning"), "inventory_stock taxonomy missing inventoryDemandPlanning");
  assert.ok(taxonomySource.includes("inventoryPurchaseNeeds"), "inventory_stock taxonomy missing inventoryPurchaseNeeds");
  assert.ok(taxonomySource.includes("inventoryReadiness"), "inventory_stock taxonomy missing inventoryReadiness");
});

// ── Inventory & Stock — registry group purity ─────────────────────────────────

test("Phase 5: Inventory & Stock registry group does not include vendor payables", () => {
  const block = extractGroupBlock(registrySource, "Inventory & Stock");
  assert.ok(block.length > 0, "Inventory & Stock group not found in registry");
  assert.ok(
    !block.includes("purchaseVendorPayables") && !block.includes("vendor-payables"),
    "Inventory & Stock group must not include vendor payables"
  );
});

test("Phase 5: Inventory & Stock registry group does not include purchase bills", () => {
  const block = extractGroupBlock(registrySource, "Inventory & Stock");
  assert.ok(
    !block.includes("purchaseBills") && !block.includes("purchase-bills"),
    "Inventory & Stock group must not include purchase bills"
  );
});

test("Phase 5: Inventory & Stock registry group does not include accounting journals", () => {
  const block = extractGroupBlock(registrySource, "Inventory & Stock");
  assert.ok(
    !block.includes("accountingJournals"),
    "Inventory & Stock group must not include accounting journals"
  );
});

test("Phase 5: Inventory & Stock registry group does not include reconciliation", () => {
  const block = extractGroupBlock(registrySource, "Inventory & Stock");
  assert.ok(
    !block.includes("BridgeReconciliation") && !block.includes("bridge-reconciliation"),
    "Inventory & Stock group must not include bridge reconciliation"
  );
});

test("Phase 5: Inventory & Stock registry group does not include billing register", () => {
  const block = extractGroupBlock(registrySource, "Inventory & Stock");
  assert.ok(
    !block.includes("billingRegister") && !block.includes("billingDirectSales"),
    "Inventory & Stock group must not include billing register or direct sales links"
  );
});

// ── Purchases & Vendors — registry group completeness ────────────────────────

test("Phase 5: Purchases & Vendors registry group includes purchases hub", () => {
  const block = extractGroupBlock(registrySource, "Purchases & Vendors");
  assert.ok(block.length > 0, "Purchases & Vendors group not found in registry");
  assert.ok(
    block.includes("ROUTES.admin.purchases,") || block.includes("ROUTES.admin.purchases "),
    "Purchases & Vendors group must include ROUTES.admin.purchases as hub entry"
  );
});

test("Phase 5: Purchases & Vendors registry group includes purchase chain routes", () => {
  const block = extractGroupBlock(registrySource, "Purchases & Vendors");
  assert.ok(block.includes("purchaseRequests"), "Missing purchaseRequests in Purchases & Vendors group");
  assert.ok(block.includes("purchaseOrders"), "Missing purchaseOrders in Purchases & Vendors group");
  assert.ok(block.includes("purchaseReceipts"), "Missing purchaseReceipts in Purchases & Vendors group");
  assert.ok(block.includes("purchaseBills"), "Missing purchaseBills in Purchases & Vendors group");
});

test("Phase 5: Purchases & Vendors registry group includes vendor payables and vendor payments", () => {
  const block = extractGroupBlock(registrySource, "Purchases & Vendors");
  assert.ok(
    block.includes("purchaseVendorPayables"),
    "Purchases & Vendors group must include purchaseVendorPayables"
  );
  assert.ok(
    block.includes("purchaseVendorPayments"),
    "Purchases & Vendors group must include purchaseVendorPayments"
  );
});

test("Phase 5: Purchases & Vendors registry group includes vendor operations routes", () => {
  const block = extractGroupBlock(registrySource, "Purchases & Vendors");
  assert.ok(block.includes("vendorsProducts"), "Missing vendorsProducts in Purchases & Vendors group");
  assert.ok(block.includes("vendorsQuotes"), "Missing vendorsQuotes in Purchases & Vendors group");
  assert.ok(block.includes("vendorsSourcing"), "Missing vendorsSourcing in Purchases & Vendors group");
  assert.ok(block.includes("vendorsLedger"), "Missing vendorsLedger in Purchases & Vendors group");
  assert.ok(block.includes("vendorsOutstanding"), "Missing vendorsOutstanding in Purchases & Vendors group");
});

// ── Purchases & Vendors — group purity ────────────────────────────────────────

test("Phase 5: Purchases & Vendors group does not include customer sales routes", () => {
  const block = extractGroupBlock(registrySource, "Purchases & Vendors");
  assert.ok(
    !block.includes("salesWorkspace") && !block.includes("billingDirectSaleWorkspace"),
    "Purchases & Vendors group must not include customer sales routes"
  );
});

test("Phase 5: Purchases & Vendors group does not include EMI subscription routes", () => {
  const block = extractGroupBlock(registrySource, "Purchases & Vendors");
  assert.ok(
    !block.includes("subscriptions") && !block.includes("advance-emi"),
    "Purchases & Vendors group must not include EMI subscription routes"
  );
});

test("Phase 5: Purchases & Vendors group does not include accounting report routes", () => {
  const block = extractGroupBlock(registrySource, "Purchases & Vendors");
  assert.ok(
    !block.includes("accountingTrialBalance") && !block.includes("accountingProfitLoss") && !block.includes("accountingBalanceSheet"),
    "Purchases & Vendors group must not include accounting report routes"
  );
});

// ── Vendor profile canonical route — Profiles & Parties ──────────────────────

test("Phase 5: vendor profile canonical route is in Profiles & Parties group", () => {
  const block = extractGroupBlock(registrySource, "Profiles & Parties");
  assert.ok(block.length > 0, "Profiles & Parties group not found in registry");
  assert.ok(
    block.includes("profilesVendors"),
    "Profiles & Parties group must include profilesVendors (vendor identity/profile canonical route)"
  );
});

test("Phase 5: /admin/profiles/vendors route constant is defined", () => {
  assert.ok(routesSource.includes('profilesVendors:'), "Missing profilesVendors route key");
  assert.ok(routesSource.includes('"/admin/profiles/vendors"'), "Missing /admin/profiles/vendors path");
});

test("Phase 5: /admin/profiles/vendors page file exists", () => {
  assert.ok(
    existsSync(join(appRoot, "profiles/vendors/page.tsx")),
    "Missing /admin/profiles/vendors/page.tsx (vendor identity canonical page)"
  );
});

// ── /admin/vendors procurement register still exists ─────────────────────────

test("Phase 5: /admin/vendors procurement page file still exists (keep_temporarily)", () => {
  assert.ok(
    existsSync(join(appRoot, "vendors/page.tsx")),
    "Legacy /admin/vendors/page.tsx must remain (keep_temporarily — procurement register)"
  );
});

test("Phase 5: vendors route constant points to /admin/vendors", () => {
  assert.ok(routesSource.includes('vendors: "/admin/vendors"'), "vendors route must point to /admin/vendors");
});

// ── purchases_vendors taxonomy includes Phase 5 routes ────────────────────────

test("Phase 5: purchases_vendors taxonomy includes vendorsLedger and vendorsOutstanding", () => {
  assert.ok(taxonomySource.includes("vendorsLedger"), "purchases_vendors taxonomy missing vendorsLedger");
  assert.ok(taxonomySource.includes("vendorsOutstanding"), "purchases_vendors taxonomy missing vendorsOutstanding");
});

test("Phase 5: purchases_vendors taxonomy includes purchaseVendorPayables and purchaseVendorPayments", () => {
  assert.ok(taxonomySource.includes("purchaseVendorPayables"), "purchases_vendors taxonomy missing purchaseVendorPayables");
  assert.ok(taxonomySource.includes("purchaseVendorPayments"), "purchases_vendors taxonomy missing purchaseVendorPayments");
});

// ── Purchases chain page files exist ─────────────────────────────────────────

test("Phase 5: purchase chain page files all exist", () => {
  const pages = [
    "purchases/page.tsx",
    "purchases/requests/page.tsx",
    "purchases/orders/page.tsx",
    "purchases/receipts/page.tsx",
    "purchases/bills/page.tsx",
    "purchases/vendor-payables/page.tsx",
    "purchases/vendor-payments/page.tsx",
    "purchases/vendor-returns/page.tsx",
    "vendors/products/page.tsx",
    "vendors/quotes/page.tsx",
    "vendors/sourcing/page.tsx",
    "vendors/ledger/page.tsx",
    "vendors/outstanding/page.tsx",
  ];
  for (const p of pages) {
    assert.ok(existsSync(join(appRoot, p)), `Missing page file: /admin/${p}`);
  }
});

// ── Unsafe label checks — vendor-payables page ───────────────────────────────

test("Phase 5: vendor-payables page does not use unsafe 'Posted Paid' column label", () => {
  const page = readFileSync(join(appRoot, "purchases/vendor-payables/page.tsx"), "utf8");
  assert.ok(
    !page.includes("Posted Paid"),
    "vendor-payables page must not use 'Posted Paid' column — replace with 'Paid to date'"
  );
});

test("Phase 5: vendor-payables page uses audit-safe 'Paid to date' column label", () => {
  const page = readFileSync(join(appRoot, "purchases/vendor-payables/page.tsx"), "utf8");
  assert.ok(
    page.includes("Paid to date"),
    "vendor-payables page must use 'Paid to date' column label"
  );
});

// ── Unsafe label checks — vendor-payments page ───────────────────────────────

test("Phase 5: vendor-payments page does not use unsafe 'posted journal trace' copy", () => {
  const page = readFileSync(join(appRoot, "purchases/vendor-payments/page.tsx"), "utf8");
  assert.ok(
    !page.includes("posted journal trace"),
    "vendor-payments page must not use 'posted journal trace' — replace with audit-safe wording"
  );
});

// ── Manufacturing — separate/deferred ────────────────────────────────────────

test("Phase 5: Manufacturing group is separate from Purchases & Vendors in registry", () => {
  const purchasesBlock = extractGroupBlock(registrySource, "Purchases & Vendors");
  assert.ok(
    !purchasesBlock.includes('"Manufacturing"'),
    "Manufacturing must not be inside the Purchases & Vendors navigation block"
  );
});

test("Phase 5: Manufacturing registry group still exists as separate group", () => {
  assert.ok(
    registrySource.includes('"Manufacturing"'),
    'Manufacturing group must remain as a separate navigation group — not merged or deleted'
  );
  assert.ok(
    registrySource.includes("ROUTES.admin.manufacturing"),
    "Manufacturing hub route must remain in registry"
  );
});

test("Phase 5: Manufacturing page files still exist unchanged", () => {
  assert.ok(existsSync(join(appRoot, "manufacturing/page.tsx")), "Missing manufacturing/page.tsx");
  assert.ok(existsSync(join(appRoot, "manufacturing/boms/page.tsx")), "Missing manufacturing/boms/page.tsx");
  assert.ok(existsSync(join(appRoot, "manufacturing/jobs/page.tsx")), "Missing manufacturing/jobs/page.tsx");
});

// ── Inventory page — no cross-module billing links ────────────────────────────

test("Phase 5: inventory dashboard page does not link to billingRegister or billingDirectSales", () => {
  const page = readFileSync(join(appRoot, "inventory/page.tsx"), "utf8");
  assert.ok(
    !page.includes("billingRegister"),
    "inventory/page.tsx must not link to billingRegister (cross-module billing link removed in Phase 5)"
  );
  assert.ok(
    !page.includes("billingDirectSales"),
    "inventory/page.tsx must not link to billingDirectSales (cross-module billing link removed in Phase 5)"
  );
});

// ── Purchases page — chain workflow copy labels ───────────────────────────────

test("Phase 5: purchases hub page includes purchase source workflow labels", () => {
  const page = readFileSync(join(appRoot, "purchases/page.tsx"), "utf8");
  assert.ok(page.includes("Purchase source workflow"), "purchases/page.tsx must include 'Purchase source workflow' copy label");
  assert.ok(page.includes("Vendor payable source"), "purchases/page.tsx must include 'Vendor payable source' copy label");
  assert.ok(page.includes("Accounting bridge status"), "purchases/page.tsx must include 'Accounting bridge status' copy label");
  assert.ok(page.includes("Reconciliation evidence"), "purchases/page.tsx must include 'Reconciliation evidence' copy label");
});
