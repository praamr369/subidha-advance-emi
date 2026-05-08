import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const navigationSource = readFileSync(join(thisFileDir, "../../src/config/navigation.ts"), "utf8");
const registrySource = readFileSync(join(thisFileDir, "../../src/config/admin-route-registry.ts"), "utf8");

test("admin sidebar includes Vendors & Procurement group", () => {
  assert.ok(registrySource.includes('"Vendors & Procurement"'));
  assert.ok(registrySource.includes("Vendor Sourcing"));
  assert.ok(registrySource.includes("Vendor Ledger"));
  assert.ok(registrySource.includes("ROUTES.admin.vendorsProducts"));
  assert.ok(registrySource.includes("Online Enquiries"));

test("vendor role navigation exists", () => {
  assert.ok(navigationSource.includes("VENDOR: ["));
  assert.ok(navigationSource.includes('href: "/vendor/quotes"'));
  assert.ok(navigationSource.includes('href: "/vendor/ledger"'));
});
