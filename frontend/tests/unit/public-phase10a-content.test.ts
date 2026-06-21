/**
 * Phase 10A: Public website content validation tests.
 *
 * Validates:
 * - Public pages exist for required routes
 * - Lucky Plan page communicates future EMI waiver only
 * - Lucky Plan page does not promise guaranteed winning
 * - Rent/Lease pages state no Lucky ID
 * - FAQ has required customer questions
 * - Rulebook has required rule sections
 * - Public routes do not expose admin/cashier paths
 * - New routes are registered in ROUTES.ts
 * - Reduced-motion CSS exists
 * - Footer references new pages
 * - LuckyIdGrid has disclaimer about no guaranteed winning
 * - Deposit readiness separated from monthly demand
 * - No fake stats in public content
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

test("new Phase 10A public routes are registered in ROUTES.ts", () => {
  const routes = readSrc("lib/routes.ts");
  assert.ok(routes.includes('faq: "/faq"'), "Missing faq route");
  assert.ok(routes.includes('rulebook: "/rulebook"'), "Missing rulebook route");
  assert.ok(routes.includes('customers: "/customers"'), "Missing customers route");
  assert.ok(routes.includes('partners: "/partners"'), "Missing partners route");
  assert.ok(routes.includes('legalDisclaimer: "/legal/disclaimer"'), "Missing legalDisclaimer route");
});

// ── Required page files ───────────────────────────────────────────────────────

test("all required public page files exist", () => {
  const pages = [
    "faq/page.tsx",
    "rulebook/page.tsx",
    "customers/page.tsx",
    "partners/page.tsx",
    "legal/disclaimer/page.tsx",
  ];
  for (const page of pages) {
    assert.ok(
      existsSync(join(appPublic, page)),
      `Missing public page: ${page}`
    );
  }
});

// ── Lucky Plan content rules ──────────────────────────────────────────────────

test("Lucky Plan page states future EMI waiver only (not full refund)", () => {
  const page = readPublicPage("lucky-plan");
  assert.ok(
    page.includes("future EMI") || page.includes("Future EMI"),
    "Lucky Plan page must mention 'future EMI'"
  );
  assert.ok(
    page.includes("waiver") || page.includes("Waiver"),
    "Lucky Plan page must mention 'waiver'"
  );
});

test("Lucky Plan page does not promise guaranteed winning", () => {
  const page = readPublicPage("lucky-plan");
  const lc = page.toLowerCase();
  // Phrases that would imply a promise — must NOT appear without negation
  assert.ok(
    !lc.includes("guarantees winning") && !lc.includes("guaranteed to win") && !lc.includes("we guarantee winning"),
    "Lucky Plan page must not promise guaranteed winning"
  );
  // The page must contain a negated form somewhere (e.g. "does not guarantee" or "not guaranteed")
  assert.ok(
    lc.includes("does not guarantee") || lc.includes("not guaranteed") || lc.includes("no guarantee"),
    "Lucky Plan page must contain a disclaimer that winning is not guaranteed"
  );
});

test("Lucky Plan page does not present the plan as gambling", () => {
  const page = readPublicPage("lucky-plan");
  const lc = page.toLowerCase();
  assert.ok(
    !lc.includes("gambling") || page.includes("not gambling") || page.includes("not a form of gambling"),
    "Lucky Plan page must not present the plan as gambling without clarification"
  );
});

// ── Rent/Lease no Lucky ID ────────────────────────────────────────────────────

test("Rent page states no Lucky ID participation", () => {
  const rentPage = readPublicPage("rent");
  const rentContent = readSrc("lib/public-content.ts");
  const combined = rentPage + rentContent;
  // The combined source must somewhere say rent has no Lucky ID
  assert.ok(
    combined.includes("does not create Lucky ID") ||
      combined.includes("do not use Lucky IDs") ||
      combined.includes("not create Lucky ID participation"),
    "Rent page or public-content.ts must clarify rent does not use Lucky IDs"
  );
  assert.ok(
    combined.toLowerCase().includes("lucky id"),
    "Rent context must mention Lucky ID (to clarify exclusion)"
  );
});

test("Lease page states no Lucky ID participation", () => {
  const leasePage = readPublicPage("lease");
  const rentContent = readSrc("lib/public-content.ts");
  const combined = leasePage + rentContent;
  assert.ok(
    combined.includes("does not create Lucky ID") ||
      combined.includes("do not use Lucky IDs") ||
      combined.includes("not create Lucky ID participation"),
    "Lease page or public-content.ts must clarify lease does not use Lucky IDs"
  );
});

// ── RentLeaseComparison shows deposit separation ──────────────────────────────

test("RentLeaseComparison shows deposit is separate from monthly demand", () => {
  const comp = readSrc("components/public/RentLeaseComparison.tsx");
  assert.ok(
    comp.includes("deposit") && comp.includes("monthly"),
    "RentLeaseComparison must show deposit and monthly demand"
  );
  assert.ok(
    comp.includes("separate") || comp.includes("Deposit is separate"),
    "RentLeaseComparison must state deposit is separate from monthly demand"
  );
});

// ── LuckyIdGrid disclaimer ────────────────────────────────────────────────────

test("LuckyIdGrid has no-guaranteed-winning disclaimer", () => {
  const grid = readSrc("components/public/LuckyIdGrid.tsx");
  assert.ok(
    grid.includes("not guarantee winning") || grid.includes("does not guarantee winning"),
    "LuckyIdGrid must include disclaimer that Lucky ID does not guarantee winning"
  );
  assert.ok(
    grid.includes("explanatory") || grid.includes("Explanatory"),
    "LuckyIdGrid must be labeled as explanatory"
  );
});

// ── FAQ content ───────────────────────────────────────────────────────────────

test("Full FAQ includes required customer questions", () => {
  const content = readSrc("lib/public-content.ts");
  const requiredQuestions = [
    "What is a Lucky ID",
    "Can one customer have multiple Lucky IDs",
    "What happens if I win",
    "Do I get",
    "rent or lease part of the Lucky Plan",
    "proof do I get after payment",
    "When does delivery happen",
    "miss an EMI payment",
    "contact the store",
  ];
  for (const q of requiredQuestions) {
    assert.ok(content.includes(q), `Missing FAQ question about: "${q}"`);
  }
});

test("FAQ includes explanation that Lucky Plan is not gambling", () => {
  const content = readSrc("lib/public-content.ts");
  assert.ok(
    content.includes("not a form of gambling") || content.includes("not gambling"),
    "FAQ must clarify Lucky Plan is not gambling"
  );
});

// ── Rulebook content ──────────────────────────────────────────────────────────

test("Rulebook has required sections", () => {
  const content = readSrc("lib/public-content.ts");
  const requiredIds = [
    "lucky-plan-structure",
    "monthly-draw",
    "winner-waiver",
    "payment-discipline",
    "rent-lease-rules",
    "delivery-handover",
    "cancellation-default",
    "customer-responsibilities",
  ];
  for (const id of requiredIds) {
    assert.ok(content.includes(id), `Missing rulebook section: ${id}`);
  }
});

test("Rulebook states winner waiver applies to future EMI only", () => {
  const content = readSrc("lib/public-content.ts");
  assert.ok(
    content.includes("future EMI waiver only") || content.includes("future EMI — EMI that has already been paid"),
    "Rulebook must state waiver applies to future EMI only"
  );
});

test("Rulebook does not contain gambling language without clarification", () => {
  const rulebookPage = readPublicPage("rulebook");
  const lc = rulebookPage.toLowerCase();
  assert.ok(
    !lc.includes("gambling") || lc.includes("not gambling"),
    "Rulebook page must not contain unqualified gambling language"
  );
});

// ── Admin routes not exposed publicly ────────────────────────────────────────

test("public pages do not link to admin routes", () => {
  const publicPages = [
    "page.tsx",         // homepage
    "lucky-plan/page.tsx",
    "rent/page.tsx",
    "lease/page.tsx",
    "faq/page.tsx",
    "rulebook/page.tsx",
    "customers/page.tsx",
    "partners/page.tsx",
  ];
  for (const page of publicPages) {
    const src = readFileSync(join(appPublic, page), "utf8");
    assert.ok(
      !src.includes('href="/admin') && !src.includes('href="/cashier'),
      `Public page ${page} must not link to admin or cashier routes`
    );
  }
});

// ── No fake stats ─────────────────────────────────────────────────────────────

test("public content does not contain fabricated customer count claims", () => {
  const content = readSrc("lib/public-content.ts");
  const fakePhrases = ["10,000 customers", "50,000 customers", "trusted by thousands"];
  for (const phrase of fakePhrases) {
    assert.ok(
      !content.includes(phrase),
      `public-content.ts must not contain fake stat: "${phrase}"`
    );
  }
  const homePage = readPublicPage(".");
  for (const phrase of fakePhrases) {
    assert.ok(
      !homePage.includes(phrase),
      `Homepage must not contain fake stat: "${phrase}"`
    );
  }
});

// ── Reduced-motion support ────────────────────────────────────────────────────

test("CSS includes prefers-reduced-motion rules for scroll-reveal animations", () => {
  const css = readSrc("app/globals.css");
  assert.ok(
    css.includes("prefers-reduced-motion: reduce"),
    "globals.css must include prefers-reduced-motion media query"
  );
  assert.ok(
    css.includes("scroll-reveal-item"),
    "globals.css must include scroll-reveal-item CSS class"
  );
});

test("PublicVisualShell CSS module respects prefers-reduced-motion", () => {
  const css = readFileSync(
    join(srcRoot, "components/public/PublicVisualShell.module.css"),
    "utf8"
  );
  assert.ok(
    css.includes("prefers-reduced-motion: reduce"),
    "PublicVisualShell.module.css must include prefers-reduced-motion"
  );
});

// ── Footer links ──────────────────────────────────────────────────────────────

test("footer includes links to new Phase 10A pages", () => {
  const footer = readSrc("components/ui/public-footer.tsx");
  assert.ok(footer.includes('ROUTES.public.faq'), "Footer must link to FAQ");
  assert.ok(footer.includes('ROUTES.public.rulebook'), "Footer must link to Rulebook");
  assert.ok(footer.includes('ROUTES.public.customers'), "Footer must link to Customer guide");
  assert.ok(footer.includes('ROUTES.public.partners'), "Footer must link to Partner program");
  assert.ok(footer.includes('ROUTES.public.legalDisclaimer'), "Footer must link to Disclaimer");
});

// ── Partners page does not promise self-approval ──────────────────────────────

test("Partners page does not promise self-approval of commissions", () => {
  const page = readPublicPage("partners");
  assert.ok(
    page.includes("cannot self-approve") || page.includes("Payout batches require business approval"),
    "Partners page must clarify partners cannot self-approve payouts"
  );
});

// ── Customers page has document safety section ────────────────────────────────

test("Customers page includes document safety section", () => {
  const page = readPublicPage("customers");
  assert.ok(
    page.includes("documentsToKeep") || page.includes("Documents every customer should keep"),
    "Customers page must include document safety section"
  );
  assert.ok(
    page.includes("receipt") || page.includes("Receipt"),
    "Customers page must mention receipts"
  );
});

// ── Disclaimer page ───────────────────────────────────────────────────────────

test("Legal disclaimer page exists and covers key topics", () => {
  const page = readPublicPage("legal/disclaimer");
  assert.ok(page.includes("not guarantee"), "Disclaimer must state no guaranteed winning");
  assert.ok(page.includes("not gambling") || page.includes("not a form of gambling"), "Disclaimer must state not gambling");
  assert.ok(page.includes("government") || page.includes("approval"), "Disclaimer must address government approval status");
  assert.ok(page.includes("approved contract"), "Disclaimer must reference approved contract as authoritative");
});

// ── EmiJourneyTimeline has warning notes ─────────────────────────────────────

test("EmiJourneyTimeline includes waiver disclaimer note", () => {
  const component = readSrc("components/public/EmiJourneyTimeline.tsx");
  assert.ok(
    component.includes("Winning is not guaranteed") || component.includes("guarantee"),
    "EmiJourneyTimeline must include disclaimer about winning"
  );
  assert.ok(
    component.includes("future EMI only") || component.includes("Waiver applies to future EMI"),
    "EmiJourneyTimeline must clarify waiver applies to future EMI only"
  );
});

// ── TrustPillars does not expose admin routes ─────────────────────────────────

test("TrustPillars component does not link to admin routes", () => {
  const comp = readSrc("components/public/TrustPillars.tsx");
  assert.ok(
    !comp.includes('href="/admin') && !comp.includes('href="/cashier'),
    "TrustPillars must not link to admin or cashier routes"
  );
});
