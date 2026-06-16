import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const navigationSource = readFileSync(join(thisFileDir, "../../src/config/navigation.ts"), "utf8");
const registrySource = readFileSync(join(thisFileDir, "../../src/config/admin-route-registry.ts"), "utf8");

// Phase 1: canonical group is "Purchases & Vendors" (was "Vendors & Procurement" in pre-Phase-1 draft)
test("admin sidebar includes Purchases & Vendors group with procurement content", () => {
  assert.ok(
    registrySource.includes('"Purchases & Vendors"'),
    'Missing canonical "Purchases & Vendors" group in registry'
  );
  assert.ok(registrySource.includes("Vendor Sourcing"), "Missing Vendor Sourcing item");
  assert.ok(registrySource.includes("Vendor Ledger"), "Missing Vendor Ledger item");
  assert.ok(registrySource.includes("ROUTES.admin.vendorsProducts"), "Missing vendorsProducts route in registry");
  assert.ok(registrySource.includes("Online Enquiries"), "Missing Online Enquiries item");
});

test("vendor role navigation exists", () => {
  assert.ok(navigationSource.includes("VENDOR: ["));
  assert.ok(navigationSource.includes('href: "/vendor/quotes"') || navigationSource.includes("VENDOR_ROUTES"));
  assert.ok(navigationSource.includes('href: "/vendor/ledger"') || navigationSource.includes("VENDOR_ROUTES"));
  assert.ok(navigationSource.includes('href: "/vendor/notifications"') || navigationSource.includes("VENDOR_ROUTES"));
});
