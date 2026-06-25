import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const navigationSource = readFileSync(join(thisFileDir, "../../src/config/navigation.ts"), "utf8");
const registrySource = readFileSync(join(thisFileDir, "../../src/config/admin-route-registry.ts"), "utf8");

// Phase 1: canonical 14 business module groups are present in navigation icon map
test("admin sidebar has Phase 1 canonical business module groups", () => {
  const expectedGroupLabels = [
    "Command Center",
    "Profiles & Parties",
    "CRM & Requests",
    "Sales & Contracts",
    "Lucky Plan Control",
    "Collections & Cashier",
    "Finance Operations",
    "Accounting & Reconciliation",
    "Inventory & Stock",
    "Purchases & Vendors",
    "Delivery & Service",
    "HR & Staff",
    "BI & Reports",
    "Settings & Governance",
  ];
  for (const label of expectedGroupLabels) {
    assert.ok(
      navigationSource.includes(`"${label}"`),
      `Missing canonical module group label: "${label}"`
    );
  }
});

// Phase 3: Lucky Plan Control group links to canonical /admin/lucky-plan/* routes
test("Lucky Plan Control registry items use canonical /admin/lucky-plan/* routes", () => {
  assert.ok(
    registrySource.includes('"Lucky Plan Control"'),
    "Missing Lucky Plan Control group in registry"
  );
  assert.ok(
    registrySource.includes("ROUTES.admin.luckyPlanControl"),
    "Missing luckyPlanControl route in Lucky Plan registry"
  );
  assert.ok(
    registrySource.includes("ROUTES.admin.luckyPlanBatches"),
    "Missing luckyPlanBatches route in Lucky Plan registry"
  );
  assert.ok(
    registrySource.includes("ROUTES.admin.luckyPlanLuckyIds"),
    "Missing luckyPlanLuckyIds route in Lucky Plan registry"
  );
  assert.ok(
    registrySource.includes("ROUTES.admin.luckyPlanDraws"),
    "Missing luckyPlanDraws route in Lucky Plan registry"
  );
  assert.ok(
    registrySource.includes("ROUTES.admin.luckyPlanWinners"),
    "Missing luckyPlanWinners route in Lucky Plan registry"
  );
});

// Phase 3: Rent/Lease is NOT inside Lucky Plan Control
test("rent/lease routes do not appear inside Lucky Plan Control navigation block", () => {
  const lines = registrySource.split("\n");
  const luckyPlanStart = lines.findIndex((l) => l.includes('"Lucky Plan Control"'));
  assert.ok(luckyPlanStart !== -1, "Lucky Plan Control group not found in registry");

  // Find next group boundary after Lucky Plan Control
  let luckyPlanEnd = lines.length;
  for (let i = luckyPlanStart + 1; i < lines.length; i++) {
    const line = lines[i];
    // Group boundary: a new group comment or item() call with a different group string
    if (/\/\/ ── \d+\./.test(line)) {
      luckyPlanEnd = i;
      break;
    }
  }

  const luckyPlanBlock = lines.slice(luckyPlanStart, luckyPlanEnd).join("\n");
  assert.ok(
    !luckyPlanBlock.includes("rentLease") && !luckyPlanBlock.includes("rent-lease"),
    "Rent/lease routes must not be inside Lucky Plan Control navigation block"
  );
});

// Phase 3: vendor role navigation still works
test("vendor role navigation exists", () => {
  assert.ok(navigationSource.includes("VENDOR: ["));
  assert.ok(navigationSource.includes('href: "/vendor/quotes"') || navigationSource.includes("VENDOR_ROUTES"));
  assert.ok(navigationSource.includes('href: "/vendor/ledger"') || navigationSource.includes("VENDOR_ROUTES"));
  assert.ok(navigationSource.includes('href: "/vendor/notifications"') || navigationSource.includes("VENDOR_ROUTES"));
});

test("Settings & Governance sidebar includes business compliance route", () => {
  const lines = registrySource.split("\n");
  const settingsStart = lines.findIndex((line) => line.includes('"Settings & Governance"'));
  assert.ok(settingsStart !== -1, "Settings & Governance group not found in registry");

  const settingsBlock = lines.slice(settingsStart).join("\n");
  assert.ok(
    settingsBlock.includes("ROUTES.admin.settingsBusinessCompliance"),
    "Settings & Governance sidebar must expose Business Compliance"
  );
  assert.ok(
    settingsBlock.includes("Contract templates, e-sign evidence"),
    "Business Compliance sidebar description must expose contract/e-sign governance scope"
  );
});
