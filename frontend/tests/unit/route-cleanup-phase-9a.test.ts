/**
 * Phase 9A — Cleanup Audit & Safe Repo Hygiene unit tests.
 *
 * These tests are CLASSIFICATION + SAFETY guards only. They do not delete or
 * change any route, page, or backend endpoint. They lock in the Phase 9A audit
 * conclusions so a later phase cannot silently:
 *   - drop a route that is intentionally preserved,
 *   - flip a compatibility-alias redirect in the wrong direction,
 *   - turn a documented backend gap into fake data / a dead button,
 *   - merge Manufacturing into Inventory/Purchases without design approval.
 *
 * All assertions are file-content / file-existence based (no module imports),
 * so they run under raw `node --test frontend/tests/unit/*.test.ts`.
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
const pagePath = (rel: string) => join(appRoot, rel, "page.tsx");
const readPage = (rel: string) => readFileSync(pagePath(rel), "utf8");

// ── 1. Phase 9A classified routes all have route constants ─────────────────────
//
// Every route the phase brief asks to "classify, not delete" must still be a
// first-class route constant. This is the do-not-silently-drop guard.

test("Phase 9A: all classified routes have constants in routes.ts", () => {
  const requiredPaths = [
    "/admin/customers",
    "/admin/partners",
    "/admin/vendors",
    "/admin/hr/staff",
    "/admin/branches",
    "/admin/crm/parties",
    "/admin/batches",
    "/admin/lucky-ids",
    "/admin/lucky-draws",
    "/admin/outstandings",
    // NOTE: legacy "/admin/customer-advances" intentionally omitted — it has a
    // page and is the active redirect target of financeCustomerAdvances, but it
    // has no named ROUTES constant (documented frontend gap / Phase 9B candidate).
    "/admin/requests/online-enquiries",
    "/admin/requests/support",
    "/admin/requests/subscriptions",
    "/admin/service-desk/cases",
    "/admin/vendors/ledger",
    "/admin/vendors/outstanding",
    "/admin/purchases/vendor-returns",
    "/admin/reports/customer-analytics",
    "/admin/manufacturing",
  ];
  for (const p of requiredPaths) {
    assert.ok(routesSource.includes(`"${p}"`), `Missing classified route constant: ${p}`);
  }
});

// ── 2. Do-not-delete: legacy content-owning pages still exist ──────────────────
//
// These legacy routes still HOST the real page (the canonical /admin/profiles/*,
// /admin/lucky-plan/*, /admin/finance/* paths redirect back to them). Phase 9A
// must keep them on disk.

test("Phase 9A: legacy content-owning route pages are not deleted", () => {
  const legacyPages = [
    "customers",
    "partners",
    "vendors",
    "hr/staff",
    "branches",
    "crm/parties",
    "batches",
    "lucky-ids",
    "lucky-draws",
    "outstandings",
    "customer-advances",
  ];
  for (const rel of legacyPages) {
    assert.ok(existsSync(pagePath(rel)), `Legacy content page must remain: /admin/${rel}`);
  }
});

test("Phase 9A: request hub legacy pages redirect to canonical request routes", () => {
  const aliasTargets: Record<string, string> = {
    "online-enquiries": "/admin/requests/online-enquiries",
    "support-requests": "/admin/requests/support",
    "subscription-requests": "/admin/requests/subscriptions",
  };
  for (const [rel, target] of Object.entries(aliasTargets)) {
    const src = readPage(rel);
    assert.ok(src.includes("redirect("), `/admin/${rel} must be a thin redirect alias`);
    assert.ok(src.includes(`redirect("${target}")`), `/admin/${rel} must redirect to ${target}`);
  }
});

test("Phase 9A: canonical request hub pages exist and are not redirects", () => {
  for (const rel of ["requests/online-enquiries", "requests/support", "requests/subscriptions"]) {
    const src = readPage(rel);
    assert.ok(existsSync(pagePath(rel)), `Canonical request page must exist: /admin/${rel}`);
    assert.ok(!src.includes("redirect("), `/admin/${rel} must be a real page, not a redirect`);
  }
});

// ── 3. Compatibility-alias redirect direction is preserved ─────────────────────
//
// The canonical "new" routes are thin redirect aliases pointing BACK to the
// legacy content routes. Locking the direction prevents an accidental redirect
// loop or a premature content move.

test("Phase 9A: profile canonical routes are thin aliases redirecting to legacy content", () => {
  const aliasTargets: Record<string, string> = {
    "profiles/customers": "/admin/customers",
    "profiles/partners": "/admin/partners",
    "profiles/vendors": "/admin/vendors",
    "profiles/branches": "/admin/branches",
    "profiles/staff": "/admin/hr/staff",
    "profiles/parties": "/admin/crm/parties",
  };
  for (const [rel, target] of Object.entries(aliasTargets)) {
    const src = readPage(rel);
    assert.ok(src.includes("redirect("), `/admin/${rel} must be a thin redirect alias`);
    assert.ok(src.includes(`redirect("${target}")`), `/admin/${rel} must redirect to ${target}`);
  }
});

test("Phase 9A: lucky-plan and finance canonical routes redirect to legacy content", () => {
  const aliasTargets: Record<string, string> = {
    "lucky-plan/batches": "/admin/batches",
    "lucky-plan/lucky-ids": "/admin/lucky-ids",
    "lucky-plan/draws": "/admin/lucky-draws",
    "finance/outstandings": "/admin/outstandings",
    "finance/customer-advances": "/admin/customer-advances",
  };
  for (const [rel, target] of Object.entries(aliasTargets)) {
    const src = readPage(rel);
    assert.ok(src.includes(`redirect("${target}")`), `/admin/${rel} must redirect to ${target}`);
  }
});

// ── 4. Documented backend gaps are preserved (no fake page) ────────────────────
//
// These paths are intentionally pageless: their backend contract does not exist
// yet. Phase 9A must NOT fabricate a page (that would be fake readiness).

test("Phase 9A: documented gap routes remain pageless (no fake readiness)", () => {
  const gapPages = [
    "finance/customer-credits",
    "finance/refunds",
    "service-desk/cases",
  ];
  for (const rel of gapPages) {
    assert.ok(
      !existsSync(pagePath(rel)),
      `/admin/${rel} must remain pageless (documented gap — no backend contract yet)`
    );
  }
});

// ── 5. Gap pages that DO exist are honest (no fetch, no fake numbers) ──────────

test("Phase 9A: customer-analytics report is implemented and links to customer profiles", () => {
  const src = readPage("reports/customer-analytics");
  assert.ok(src.includes("apiFetch"), "customer-analytics must fetch live retention data");
  assert.ok(src.includes("Open profile"), "customer-analytics must link to customer profile drill-down");
  assert.ok(
    !src.includes("not yet implemented") && !src.includes("Not yet implemented"),
    "customer-analytics must no longer claim it is unimplemented"
  );
});

test("Phase 9A: lucky-plan winners page is implemented and fetches live winner records", () => {
  const src = readPage("lucky-plan/winners");
  assert.ok(src.includes("listLuckyDrawWinners"), "winners page must fetch live winner data");
  assert.ok(src.includes("useEffect"), "winners page must load data on mount");
  assert.ok(src.includes("future EMI"), "winners page must preserve the future-EMI waiver rule");
  assert.ok(
    !src.includes("Gap") && !src.includes("No fake winner data"),
    "winners page must no longer describe itself as a missing-endpoint gap"
  );
});

test("Phase 9A: second-pass stub pages remain honest stubs", () => {
  const stubPages = ["vendors/ledger", "vendors/outstanding"];
  for (const rel of stubPages) {
    assert.ok(existsSync(pagePath(rel)), `Second-pass stub page must exist: /admin/${rel}`);
  }

  const ledger = readPage("vendors/ledger");
  const outstanding = readPage("vendors/outstanding");
  assert.ok(ledger.includes("stub") || ledger.includes("detail page"), "vendor ledger must be an honest stub");
  assert.ok(
    outstanding.includes("vendor detail") || outstanding.includes("outstanding APIs"),
    "vendor outstanding must point to per-vendor detail/API, not show fake aggregates"
  );
});

// ── 6. Safety boundary: classified read-only/stub pages claim no mutation ───────

test("Phase 9A: classified gap/stub pages contain no posting/settlement/payroll mutation copy", () => {
  const pages = [
    "vendors/ledger",
    "vendors/outstanding",
    "purchases/vendor-returns",
    "reports/customer-analytics",
    "lucky-plan/winners",
  ];
  const unsafe = [
    "auto-post",
    "posted to ledger",
    "payment posted",
    "journal posted",
    "settlement complete",
    "salary paid",
    "payroll posted",
    "marked reconciled",
  ];
  for (const rel of pages) {
    const src = readPage(rel).toLowerCase();
    for (const phrase of unsafe) {
      assert.ok(!src.includes(phrase), `/admin/${rel} must not imply mutation: "${phrase}"`);
    }
  }
});

// ── 7. Manufacturing stays separate / deferred ─────────────────────────────────

test("Phase 9A: Manufacturing remains a separate registry group (not merged into Purchases/Inventory)", () => {
  assert.ok(registrySource.includes('"Manufacturing"'), "Manufacturing group must remain in registry");
  const lines = registrySource.split("\n");
  const purchasesStart = lines.findIndex((l) => l.includes('"Purchases & Vendors"'));
  // Purchases & Vendors block ends at the next "// ── N." group comment.
  let purchasesEnd = lines.length;
  for (let i = purchasesStart + 1; i < lines.length; i++) {
    if (/\/\/ ── \d+\./.test(lines[i])) { purchasesEnd = i; break; }
  }
  const purchasesBlock = lines.slice(purchasesStart, purchasesEnd).join("\n");
  assert.ok(
    !purchasesBlock.includes('"Manufacturing"') && !purchasesBlock.includes("ROUTES.admin.manufacturing"),
    "Manufacturing must not be merged into the Purchases & Vendors group"
  );
});

test("Phase 9A: Manufacturing pages still exist (deferred, not deleted)", () => {
  for (const rel of ["manufacturing", "manufacturing/boms", "manufacturing/jobs"]) {
    assert.ok(existsSync(pagePath(rel)), `Manufacturing page must remain: /admin/${rel}`);
  }
});

// ── 8. service-desk/cases gap: no nav item links to the missing page ───────────
//
// serviceDeskCases is classified in the taxonomy but has no page. The "Cases"
// navigation item must point at the service-desk hub (which has a page), never
// at the pageless /admin/service-desk/cases — otherwise it is a dead link.

test("Phase 9A: navigation 'Cases' item points at the service-desk hub, not the pageless cases route", () => {
  const lines = registrySource.split("\n");
  const casesItem = lines.find((l) => l.includes('item("Delivery & Service", "Cases"'));
  assert.ok(casesItem, "Delivery & Service must keep a 'Cases' navigation item");
  assert.ok(
    casesItem!.includes("ROUTES.admin.serviceDesk") && !casesItem!.includes("serviceDeskCases"),
    "'Cases' nav item must link to the service-desk hub, not the pageless serviceDeskCases route"
  );
});

// ── 9. Canonical module roots that exist resolve to real pages (route smoke) ───

test("Phase 9A: canonical module hub routes that exist have page files", () => {
  const hubs = [
    "profiles",
    "lucky-plan",
    "finance",
    "accounting",
    "inventory",
    "purchases",
    "hr",
    "bi",
    "reports",
    "service-desk",
    "crm",
    "requests",
  ];
  for (const rel of hubs) {
    assert.ok(existsSync(pagePath(rel)), `Canonical hub page must exist: /admin/${rel}`);
  }
});

// ── 10. Taxonomy still classifies the named routes (classified, not dropped) ─

test("Phase 9A: taxonomy still owns the classified routes", () => {
  assert.ok(taxonomySource.includes("serviceDeskCases"), "taxonomy must still classify serviceDeskCases");
  assert.ok(taxonomySource.includes("reportsCustomerAnalytics"), "taxonomy must still classify reportsCustomerAnalytics");
  assert.ok(taxonomySource.includes("purchaseVendorReturns"), "taxonomy must still classify purchaseVendorReturns");
  assert.ok(taxonomySource.includes("vendorsLedger"), "taxonomy must still classify vendorsLedger");
  assert.ok(taxonomySource.includes("vendorsOutstanding"), "taxonomy must still classify vendorsOutstanding");
});
