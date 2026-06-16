import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const routesSource = readFileSync(join(thisFileDir, "../../src/lib/routes.ts"), "utf8");
const registrySource = readFileSync(join(thisFileDir, "../../src/config/admin-route-registry.ts"), "utf8");
const taxonomySource = readFileSync(join(thisFileDir, "../../src/config/admin-module-taxonomy.ts"), "utf8");

// Phase 2: canonical profile routes exist in routes.ts
test("profile canonical routes are defined in ROUTES", () => {
  const expectedKeys = [
    "profiles:",
    "profilesCustomers:",
    "profilesPartners:",
    "profilesVendors:",
    "profilesStaff:",
    "profilesBranches:",
    "profilesParties:",
  ];
  for (const key of expectedKeys) {
    assert.ok(routesSource.includes(key), `Missing route key: ${key}`);
  }
});

test("profile canonical route paths are correct", () => {
  assert.ok(routesSource.includes('"/admin/profiles"'), "Missing /admin/profiles");
  assert.ok(routesSource.includes('"/admin/profiles/customers"'), "Missing /admin/profiles/customers");
  assert.ok(routesSource.includes('"/admin/profiles/partners"'), "Missing /admin/profiles/partners");
  assert.ok(routesSource.includes('"/admin/profiles/vendors"'), "Missing /admin/profiles/vendors");
  assert.ok(routesSource.includes('"/admin/profiles/staff"'), "Missing /admin/profiles/staff");
  assert.ok(routesSource.includes('"/admin/profiles/branches"'), "Missing /admin/profiles/branches");
  assert.ok(routesSource.includes('"/admin/profiles/parties"'), "Missing /admin/profiles/parties");
});

// Navigation registry contains Profiles & Parties group with canonical routes
test("admin route registry has Profiles & Parties group with canonical routes", () => {
  assert.ok(registrySource.includes('"Profiles & Parties"'), "Missing Profiles & Parties group");
  assert.ok(registrySource.includes("ROUTES.admin.profiles"), "Missing profiles hub in registry");
  assert.ok(registrySource.includes("ROUTES.admin.profilesCustomers"), "Missing profilesCustomers in registry");
  assert.ok(registrySource.includes("ROUTES.admin.profilesPartners"), "Missing profilesPartners in registry");
  assert.ok(registrySource.includes("ROUTES.admin.profilesVendors"), "Missing profilesVendors in registry");
  assert.ok(registrySource.includes("ROUTES.admin.profilesStaff"), "Missing profilesStaff in registry");
  assert.ok(registrySource.includes("ROUTES.admin.profilesBranches"), "Missing profilesBranches in registry");
  assert.ok(registrySource.includes("ROUTES.admin.profilesParties"), "Missing profilesParties in registry");
});

// Old legacy routes remain in the registry (backward compatibility)
test("legacy profile routes still exist in registry for backward compatibility", () => {
  assert.ok(registrySource.includes("ROUTES.admin.partnerPaymentRequests"), "Missing partnerPaymentRequests child route");
  assert.ok(registrySource.includes("ROUTES.admin.partnersCollectionRequests"), "Missing partnersCollectionRequests child route");
});

// Taxonomy has profiles_parties module with correct canonical root
test("module taxonomy has profiles_parties module with correct canonical root", () => {
  assert.ok(taxonomySource.includes('"profiles_parties"'), "Missing profiles_parties module key in taxonomy");
  assert.ok(taxonomySource.includes('"/admin/profiles"'), "Missing /admin/profiles canonical root in taxonomy");
  assert.ok(taxonomySource.includes('"/admin/profiles/customers"'), "Missing /admin/profiles/customers in taxonomy primaryRoutes");
  assert.ok(taxonomySource.includes('"profile"'), "Missing profile effect type in taxonomy");
});

// Safety: profile pages must not appear in financial workflow groups
test("profile routes do not appear under financial module groups in registry", () => {
  const lines = registrySource.split("\n");
  const financialGroups = ["Finance Operations", "Accounting & Reconciliation", "Collections & Cashier"];
  for (const group of financialGroups) {
    const groupBlockStart = lines.findIndex((l) => l.includes(`"${group}"`));
    if (groupBlockStart === -1) continue;
    const groupBlock = lines.slice(groupBlockStart, groupBlockStart + 50).join("\n");
    assert.ok(
      !groupBlock.includes("profilesCustomers") &&
      !groupBlock.includes("profilesPartners") &&
      !groupBlock.includes("profilesVendors"),
      `Profile routes must not appear inside ${group} navigation block`
    );
  }
});
