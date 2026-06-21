/**
 * Phase 10B: Contracts hub and legal sub-pages validation tests.
 *
 * Validates:
 * - New contracts routes are registered in ROUTES.ts
 * - New legal routes are registered in ROUTES.ts
 * - Contracts page files exist at /contracts and sub-routes
 * - Legal pages exist under /legal prefix
 * - Contracts hub links to all three contract types
 * - contracts/advance-emi states future EMI waiver and no guaranteed winning
 * - contracts/rent and contracts/lease state no Lucky ID participation
 * - Footer includes copyright notice
 * - Footer includes contracts link and about link
 * - Nav client links to /contracts
 * - No admin routes exposed in contracts pages
 * - No fake stats in contracts pages
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(thisDir, "../../src");
const appPublic = join(srcRoot, "app/(public)");

function readSrc(relPath: string): string {
  return readFileSync(join(srcRoot, relPath), "utf8");
}

function readPublicPage(route: string): string {
  return readFileSync(join(appPublic, route, "page.tsx"), "utf8");
}

// ── Route registration ────────────────────────────────────────────────────────

test("contracts routes are registered in ROUTES.ts", () => {
  const routes = readSrc("lib/routes.ts");
  assert.ok(routes.includes('contracts: "/contracts"'), "Missing contracts route");
  assert.ok(routes.includes('contractsAdvanceEmi: "/contracts/advance-emi"'), "Missing contractsAdvanceEmi route");
  assert.ok(routes.includes('contractsRent: "/contracts/rent"'), "Missing contractsRent route");
  assert.ok(routes.includes('contractsLease: "/contracts/lease"'), "Missing contractsLease route");
});

test("legal sub-routes are registered in ROUTES.ts", () => {
  const routes = readSrc("lib/routes.ts");
  assert.ok(routes.includes('legalTerms: "/legal/terms"'), "Missing legalTerms route");
  assert.ok(routes.includes('legalPrivacy: "/legal/privacy"'), "Missing legalPrivacy route");
  assert.ok(routes.includes('legalPolicies: "/legal/policies"'), "Missing legalPolicies route");
});

// ── Required page files ───────────────────────────────────────────────────────

test("contracts page files exist", () => {
  const pages = [
    "contracts/page.tsx",
    "contracts/advance-emi/page.tsx",
    "contracts/rent/page.tsx",
    "contracts/lease/page.tsx",
  ];
  for (const page of pages) {
    assert.ok(
      existsSync(join(appPublic, page)),
      `Missing contracts page: ${page}`
    );
  }
});

test("legal sub-pages exist under /legal prefix", () => {
  const pages = [
    "legal/terms/page.tsx",
    "legal/privacy/page.tsx",
    "legal/policies/page.tsx",
    "legal/disclaimer/page.tsx",
  ];
  for (const page of pages) {
    assert.ok(
      existsSync(join(appPublic, page)),
      `Missing legal page: ${page}`
    );
  }
});

// ── Contracts hub ─────────────────────────────────────────────────────────────

test("contracts hub page links to all three contract sub-pages", () => {
  const hub = readPublicPage("contracts");
  assert.ok(
    hub.includes("contractsAdvanceEmi") || hub.includes("/contracts/advance-emi"),
    "Contracts hub must link to advance-emi"
  );
  assert.ok(
    hub.includes("contractsRent") || hub.includes("/contracts/rent"),
    "Contracts hub must link to rent"
  );
  assert.ok(
    hub.includes("contractsLease") || hub.includes("/contracts/lease"),
    "Contracts hub must link to lease"
  );
});

test("contracts hub explains Advance EMI includes Lucky ID", () => {
  const hub = readPublicPage("contracts");
  assert.ok(
    hub.toLowerCase().includes("lucky id"),
    "Contracts hub must mention Lucky ID (Advance EMI has it)"
  );
});

test("contracts hub states rent and lease do not have Lucky ID", () => {
  const hub = readPublicPage("contracts");
  assert.ok(
    hub.includes("No Lucky ID") || hub.includes("does not create Lucky ID") || hub.includes("not create Lucky ID"),
    "Contracts hub must clarify rent/lease do not have Lucky ID"
  );
});

// ── contracts/advance-emi content rules ──────────────────────────────────────

test("contracts/advance-emi page states future EMI waiver only", () => {
  const page = readPublicPage("contracts/advance-emi");
  assert.ok(
    page.includes("future EMI") || page.includes("Future EMI"),
    "contracts/advance-emi must mention future EMI waiver"
  );
  assert.ok(
    page.includes("waiver") || page.includes("Waiver"),
    "contracts/advance-emi must mention waiver"
  );
});

test("contracts/advance-emi page does not promise guaranteed winning", () => {
  const page = readPublicPage("contracts/advance-emi");
  const lc = page.toLowerCase();
  assert.ok(
    !lc.includes("guarantees winning") && !lc.includes("guaranteed to win"),
    "contracts/advance-emi must not promise guaranteed winning"
  );
  assert.ok(
    lc.includes("does not guarantee") || lc.includes("not guaranteed") || lc.includes("no guarantee"),
    "contracts/advance-emi must contain a no-guarantee disclaimer"
  );
});

test("contracts/advance-emi does not present the plan as gambling", () => {
  const page = readPublicPage("contracts/advance-emi");
  const lc = page.toLowerCase();
  assert.ok(
    !lc.includes("gambling") || page.includes("not gambling") || page.includes("not a form of gambling"),
    "contracts/advance-emi must not present the plan as gambling without clarification"
  );
});

// ── contracts/rent and contracts/lease no Lucky ID ───────────────────────────

test("contracts/rent page states no Lucky ID participation", () => {
  const page = readPublicPage("contracts/rent");
  assert.ok(
    page.includes("does not create Lucky ID") ||
      page.includes("No Lucky ID") ||
      page.includes("not create Lucky ID participation"),
    "contracts/rent must clarify rent does not create Lucky ID participation"
  );
});

test("contracts/lease page states no Lucky ID participation", () => {
  const page = readPublicPage("contracts/lease");
  assert.ok(
    page.includes("does not create Lucky ID") ||
      page.includes("No Lucky ID") ||
      page.includes("not create Lucky ID participation"),
    "contracts/lease must clarify lease does not create Lucky ID participation"
  );
});

test("contracts/rent page has no EMI waiver benefit claim", () => {
  const page = readPublicPage("contracts/rent");
  assert.ok(
    !page.includes("EMI waiver benefit") ||
      page.includes("no EMI waiver") ||
      page.includes("does not create") ||
      page.includes("waiver benefits"),
    "contracts/rent must not promise EMI waiver benefit"
  );
});

// ── Footer ────────────────────────────────────────────────────────────────────

test("footer includes copyright notice", () => {
  const footer = readSrc("components/ui/public-footer.tsx");
  assert.ok(
    footer.includes("Subidha Furniture") && footer.includes("All rights reserved"),
    "Footer must include '© Subidha Furniture. All rights reserved.'"
  );
  assert.ok(
    footer.includes("&copy;") || footer.includes("©"),
    "Footer must include copyright symbol"
  );
});

test("footer includes contracts link", () => {
  const footer = readSrc("components/ui/public-footer.tsx");
  assert.ok(
    footer.includes("ROUTES.public.contracts") || footer.includes('"/contracts"'),
    "Footer must link to /contracts"
  );
});

test("footer includes about link", () => {
  const footer = readSrc("components/ui/public-footer.tsx");
  assert.ok(
    footer.includes("ROUTES.public.about") || footer.includes('"/about"'),
    "Footer must link to /about"
  );
});

test("footer includes legalDisclaimer link", () => {
  const footer = readSrc("components/ui/public-footer.tsx");
  assert.ok(
    footer.includes("ROUTES.public.legalDisclaimer"),
    "Footer must link to legalDisclaimer"
  );
});

// ── Nav ───────────────────────────────────────────────────────────────────────

test("nav client links to /contracts not /lucky-plan", () => {
  const nav = readSrc("components/ui/public-nav.client.tsx");
  assert.ok(
    nav.includes("ROUTES.public.contracts"),
    "Nav must reference ROUTES.public.contracts"
  );
  const linkSrc = nav.includes("ROUTES.public.contracts") && nav.includes("dictionary.links[2]");
  assert.ok(linkSrc, "Nav link[2] must use ROUTES.public.contracts");
});

test("i18n nav.links[2] is Contracts in English", () => {
  const i18n = readSrc("lib/public-i18n.ts");
  assert.ok(
    i18n.includes('"Contracts"') || i18n.includes("'Contracts'"),
    "i18n must include 'Contracts' label for nav (English)"
  );
});

// ── No admin routes exposed ───────────────────────────────────────────────────

test("contracts pages do not link to admin or cashier routes", () => {
  const contractPages = [
    "contracts/page.tsx",
    "contracts/advance-emi/page.tsx",
    "contracts/rent/page.tsx",
    "contracts/lease/page.tsx",
  ];
  for (const page of contractPages) {
    const src = readFileSync(join(appPublic, page), "utf8");
    assert.ok(
      !src.includes('href="/admin') && !src.includes('href="/cashier'),
      `${page} must not link to admin or cashier routes`
    );
  }
});

// ── No fake stats ─────────────────────────────────────────────────────────────

test("contracts pages do not contain fake customer count claims", () => {
  const fakePhrases = ["10,000 customers", "50,000 customers", "trusted by thousands"];
  const contractPages = [
    "contracts/page.tsx",
    "contracts/advance-emi/page.tsx",
    "contracts/rent/page.tsx",
    "contracts/lease/page.tsx",
  ];
  for (const page of contractPages) {
    const src = readFileSync(join(appPublic, page), "utf8");
    for (const phrase of fakePhrases) {
      assert.ok(!src.includes(phrase), `${page} must not contain fake stat: "${phrase}"`);
    }
  }
});
