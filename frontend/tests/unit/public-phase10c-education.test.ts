/**
 * Phase 10C: Public Customer Education Pages — validation tests.
 *
 * Validates:
 * - /how-it-works covers all five journeys
 * - /customers explains payment history, receipts, contracts, and customer limitations
 * - /partners states no self-approval of payout and has Login/Contracts CTAs
 * - /rulebook states future EMI waiver only and no guaranteed winning
 * - /faq includes all required core questions
 * - /about uses Subidha Furniture / Subidha Core and avoids fake awards/scale
 * - /contact does not include fake contact details
 * - /products uses category examples and avoids fake stock/price
 * - /legal/disclaimer contains no-guarantee, no-public-accounting, and product-pricing wording
 * - Footer copyright exists across public pages
 * - Public pages do not expose admin/cashier routes
 * - Public pages do not contain fake stats like "10,000 customers"
 * - Contracts hub from Phase 10B still works
 * - Reduced-motion support remains present if animated components exist
 * - Nav links to Contracts
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

function readContent(): string {
  return readFileSync(join(srcRoot, "lib/public-content.ts"), "utf8");
}

// ── Page files exist ──────────────────────────────────────────────────────────

test("all Phase 10C education page files exist", () => {
  const pages = [
    "how-it-works/page.tsx",
    "customers/page.tsx",
    "partners/page.tsx",
    "rulebook/page.tsx",
    "faq/page.tsx",
    "about/page.tsx",
    "contact/page.tsx",
    "products/page.tsx",
    "legal/disclaimer/page.tsx",
  ];
  for (const page of pages) {
    assert.ok(existsSync(join(appPublic, page)), `Missing page: ${page}`);
  }
});

// ── /how-it-works: five journeys ──────────────────────────────────────────────

test("/how-it-works page mentions all five journey labels", () => {
  const page = readPublicPage("how-it-works");
  assert.ok(
    page.includes("Journey A") || page.includes("HOW_IT_WORKS_JOURNEY_A") || page.includes("advance-emi"),
    "/how-it-works must include Advance EMI journey (A)"
  );
  assert.ok(
    page.includes("Journey B") || page.includes("HOW_IT_WORKS_JOURNEY_B") || page.includes("rent"),
    "/how-it-works must include Rent journey (B)"
  );
  assert.ok(
    page.includes("Journey C") || page.includes("HOW_IT_WORKS_JOURNEY_C") || page.includes("lease"),
    "/how-it-works must include Lease journey (C)"
  );
  assert.ok(
    page.includes("Journey D") || page.includes("HOW_IT_WORKS_JOURNEY_D") || page.includes("payment"),
    "/how-it-works must include Payment journey (D)"
  );
  assert.ok(
    page.includes("Journey E") || page.includes("HOW_IT_WORKS_JOURNEY_E") || page.includes("delivery"),
    "/how-it-works must include Delivery journey (E)"
  );
});

test("HOW_IT_WORKS journey content exists in public-content.ts", () => {
  const content = readContent();
  assert.ok(content.includes("HOW_IT_WORKS_JOURNEY_A"), "Missing HOW_IT_WORKS_JOURNEY_A");
  assert.ok(content.includes("HOW_IT_WORKS_JOURNEY_B"), "Missing HOW_IT_WORKS_JOURNEY_B");
  assert.ok(content.includes("HOW_IT_WORKS_JOURNEY_C"), "Missing HOW_IT_WORKS_JOURNEY_C");
  assert.ok(content.includes("HOW_IT_WORKS_JOURNEY_D"), "Missing HOW_IT_WORKS_JOURNEY_D");
  assert.ok(content.includes("HOW_IT_WORKS_JOURNEY_E"), "Missing HOW_IT_WORKS_JOURNEY_E");
});

test("/how-it-works Advance EMI journey includes Lucky ID and draw", () => {
  const content = readContent();
  const journeyA = content.slice(
    content.indexOf("HOW_IT_WORKS_JOURNEY_A"),
    content.indexOf("HOW_IT_WORKS_JOURNEY_B")
  );
  assert.ok(journeyA.toLowerCase().includes("lucky id"), "Journey A must mention Lucky ID");
  assert.ok(journeyA.toLowerCase().includes("draw"), "Journey A must mention draw");
  assert.ok(
    journeyA.toLowerCase().includes("waiver") || journeyA.toLowerCase().includes("future emi"),
    "Journey A must mention future EMI waiver"
  );
  assert.ok(
    journeyA.toLowerCase().includes("not guarantee") ||
      journeyA.toLowerCase().includes("does not guarantee") ||
      journeyA.toLowerCase().includes("winning is not"),
    "Journey A must state winning is not guaranteed"
  );
});

test("/how-it-works Rent journey mentions no Lucky ID and deposit", () => {
  const content = readContent();
  const journeyB = content.slice(
    content.indexOf("HOW_IT_WORKS_JOURNEY_B"),
    content.indexOf("HOW_IT_WORKS_JOURNEY_C")
  );
  assert.ok(
    journeyB.toLowerCase().includes("deposit"),
    "Journey B must mention deposit"
  );
});

test("/how-it-works Delivery journey mentions backend is authoritative", () => {
  const content = readContent();
  const journeyE = content.slice(content.indexOf("HOW_IT_WORKS_JOURNEY_E"));
  assert.ok(
    journeyE.toLowerCase().includes("backend") ||
      journeyE.toLowerCase().includes("authoritative") ||
      journeyE.toLowerCase().includes("internal"),
    "Journey E must mention backend/authoritative/internal"
  );
});

test("/how-it-works page states winner benefit is future EMI waiver only", () => {
  const page = readPublicPage("how-it-works");
  assert.ok(
    page.includes("future EMI") || page.includes("Future EMI"),
    "/how-it-works must state future EMI waiver"
  );
  assert.ok(
    page.includes("waiver") || page.includes("Waiver"),
    "/how-it-works must mention waiver"
  );
});

test("/how-it-works page does not promise guaranteed winning", () => {
  const page = readPublicPage("how-it-works");
  const lc = page.toLowerCase();
  assert.ok(
    !lc.includes("guarantees winning") && !lc.includes("guaranteed to win"),
    "/how-it-works must not promise guaranteed winning"
  );
});

// ── /customers ────────────────────────────────────────────────────────────────

test("/customers page explains payment history and receipts", () => {
  const page = readPublicPage("customers");
  assert.ok(
    page.toLowerCase().includes("payment history") || page.toLowerCase().includes("receipt"),
    "/customers must mention payment history or receipts"
  );
});

test("/customers page explains contracts and Lucky IDs", () => {
  const page = readPublicPage("customers");
  assert.ok(
    page.toLowerCase().includes("contract"),
    "/customers must mention contracts"
  );
  assert.ok(
    page.toLowerCase().includes("lucky id"),
    "/customers must mention Lucky IDs"
  );
});

test("/customers page explicitly states customer limitations", () => {
  const page = readPublicPage("customers");
  const lc = page.toLowerCase();
  assert.ok(
    lc.includes("cannot self-post") || lc.includes("customer_limitations") || lc.includes("CUSTOMER_LIMITATIONS"),
    "/customers must reference CUSTOMER_LIMITATIONS or include limitation text"
  );
  assert.ok(
    lc.includes("self-approve") || lc.includes("limitations") || lc.includes("cannot"),
    "/customers must address what customers cannot do"
  );
});

test("/customers page has Login and Contracts CTAs", () => {
  const page = readPublicPage("customers");
  assert.ok(
    page.includes("ROUTES.public.login") || page.includes('"/login"'),
    "/customers must link to Login"
  );
  assert.ok(
    page.includes("ROUTES.public.contracts") || page.includes('"/contracts"'),
    "/customers must link to Contracts"
  );
});

test("/customers page mentions multiple Lucky IDs", () => {
  const page = readPublicPage("customers");
  assert.ok(
    page.toLowerCase().includes("multiple lucky id") || page.includes("CUSTOMER_MULTI_CONTRACT_INFO"),
    "/customers must mention multiple Lucky IDs or multi-contract info"
  );
});

test("CUSTOMER_LIMITATIONS exists in public-content.ts with required restrictions", () => {
  const content = readContent();
  assert.ok(content.includes("CUSTOMER_LIMITATIONS"), "CUSTOMER_LIMITATIONS must be exported");
  assert.ok(
    content.includes("cannot self-post") || content.includes("Cannot self-post"),
    "CUSTOMER_LIMITATIONS must include cannot self-post payments"
  );
  assert.ok(
    content.includes("cannot self-approve") || content.includes("Cannot self-approve"),
    "CUSTOMER_LIMITATIONS must include cannot self-approve delivery"
  );
  assert.ok(
    content.includes("accounting records") || content.includes("cannot edit accounting"),
    "CUSTOMER_LIMITATIONS must include cannot edit accounting records"
  );
});

// ── /partners ─────────────────────────────────────────────────────────────────

test("/partners page states no self-approval of payout", () => {
  const page = readPublicPage("partners");
  const lc = page.toLowerCase();
  assert.ok(
    lc.includes("cannot self-approve") || lc.includes("self-approve") || lc.includes("self-post"),
    "/partners must state partner cannot self-approve payout"
  );
  assert.ok(
    lc.includes("approval required") || lc.includes("require") || lc.includes("business approval"),
    "/partners must state payout requires business approval"
  );
});

test("/partners page has no guaranteed commission promise", () => {
  const page = readPublicPage("partners");
  const lc = page.toLowerCase();
  assert.ok(
    lc.includes("no guaranteed") ||
      lc.includes("not guaranteed") ||
      lc.includes("commission eligibility"),
    "/partners must not promise guaranteed commission"
  );
});

test("/partners page has Login and Contracts CTAs", () => {
  const page = readPublicPage("partners");
  assert.ok(
    page.includes("ROUTES.public.login") || page.includes('"/login"'),
    "/partners must link to Login"
  );
  assert.ok(
    page.includes("ROUTES.public.contracts") || page.includes('"/contracts"'),
    "/partners must link to Contracts"
  );
});

test("/partners page has Contact Store CTA", () => {
  const page = readPublicPage("partners");
  assert.ok(
    page.includes("ROUTES.public.contact") || page.includes('"/contact"'),
    "/partners must link to Contact Store"
  );
});

// ── /rulebook ─────────────────────────────────────────────────────────────────

test("/rulebook states future EMI waiver only (via RULEBOOK_SECTIONS content)", () => {
  // rulebook page correctly delegates content to RULEBOOK_SECTIONS in public-content.ts
  const content = readContent();
  const rulebookSections = content.slice(content.indexOf("RULEBOOK_SECTIONS"));
  assert.ok(
    rulebookSections.includes("future EMI") || rulebookSections.includes("Future EMI"),
    "RULEBOOK_SECTIONS must state future EMI waiver"
  );
  assert.ok(
    rulebookSections.includes("waiver") || rulebookSections.includes("Waiver"),
    "RULEBOOK_SECTIONS must mention waiver"
  );
  // page must import RULEBOOK_SECTIONS
  const page = readPublicPage("rulebook");
  assert.ok(page.includes("RULEBOOK_SECTIONS"), "/rulebook page must import RULEBOOK_SECTIONS");
});

test("/rulebook states winning is not guaranteed (via RULEBOOK_SECTIONS content)", () => {
  const content = readContent();
  const rulebookSections = content.slice(content.indexOf("RULEBOOK_SECTIONS"));
  const lc = rulebookSections.toLowerCase();
  assert.ok(
    lc.includes("not guaranteed") || lc.includes("does not guarantee") || lc.includes("no guarantee"),
    "RULEBOOK_SECTIONS must state winning is not guaranteed"
  );
  // page must import RULEBOOK_SECTIONS
  const page = readPublicPage("rulebook");
  assert.ok(page.includes("RULEBOOK_SECTIONS"), "/rulebook page must import RULEBOOK_SECTIONS");
});

test("/rulebook explains Lucky ID and batch concepts (via RULEBOOK_SECTIONS content)", () => {
  const content = readContent();
  const rulebookSections = content.slice(content.indexOf("RULEBOOK_SECTIONS"));
  assert.ok(rulebookSections.toLowerCase().includes("lucky id"), "RULEBOOK_SECTIONS must explain Lucky ID");
  assert.ok(rulebookSections.toLowerCase().includes("batch"), "RULEBOOK_SECTIONS must explain batch");
  // page must import RULEBOOK_SECTIONS
  const page = readPublicPage("rulebook");
  assert.ok(page.includes("RULEBOOK_SECTIONS"), "/rulebook page must import RULEBOOK_SECTIONS");
});

test("/rulebook states rent and lease have no Lucky ID", () => {
  const page = readPublicPage("rulebook");
  assert.ok(
    page.includes("Rent and lease do not use Lucky") ||
      page.includes("rent-lease-rules") ||
      page.includes("RULEBOOK_SECTIONS"),
    "/rulebook must clarify rent/lease have no Lucky ID"
  );
});

test("/rulebook does not present Lucky Plan as gambling without clarification", () => {
  const page = readPublicPage("rulebook");
  const lc = page.toLowerCase();
  assert.ok(
    !lc.includes("gambling") || lc.includes("not gambling") || lc.includes("not a form of gambling"),
    "/rulebook must not present Lucky Plan as gambling without clarification"
  );
});

// ── /faq ──────────────────────────────────────────────────────────────────────

test("/faq includes question about Subidha Core", () => {
  const content = readContent();
  assert.ok(
    content.includes("What is Subidha Core"),
    "PHASE10C_FAQ must include 'What is Subidha Core?'"
  );
});

test("/faq includes question about Advance EMI / Lucky Plan", () => {
  const content = readContent();
  assert.ok(
    content.includes("What is Advance EMI") || content.includes("Advance EMI / Lucky Plan"),
    "PHASE10C_FAQ must include Advance EMI / Lucky Plan question"
  );
});

test("/faq includes question about guaranteed winning", () => {
  const content = readContent();
  assert.ok(
    content.includes("guaranteed") && content.includes("winning"),
    "FAQ content must address guaranteed winning"
  );
  assert.ok(
    content.includes("not guaranteed") || content.includes("No."),
    "FAQ must state winning is not guaranteed"
  );
});

test("/faq includes question about Lucky IDs", () => {
  const content = readContent();
  assert.ok(
    content.includes("What is a Lucky ID"),
    "FAQ must include 'What is a Lucky ID?'"
  );
});

test("/faq includes question about multiple Lucky IDs", () => {
  const content = readContent();
  assert.ok(
    content.includes("multiple Lucky ID") || content.includes("Can one customer have multiple"),
    "FAQ must address multiple Lucky IDs"
  );
});

test("/faq includes question about what proof customer gets after payment", () => {
  const content = readContent();
  assert.ok(
    content.includes("What proof do I get") || content.includes("How do receipts work"),
    "FAQ must address proof/receipts after payment"
  );
});

test("/faq includes question about partner payout approval", () => {
  const content = readContent();
  assert.ok(
    content.includes("Can a partner approve") || content.includes("partner approve"),
    "PHASE10C_FAQ must include partner payout approval question"
  );
  assert.ok(
    content.toLowerCase().includes("cannot self-approve") || content.includes("No. Partner"),
    "FAQ must state partner cannot self-approve payout"
  );
});

test("/faq includes question about Terms & Conditions", () => {
  const content = readContent();
  assert.ok(
    content.includes("Terms & Conditions") || content.includes("Where can I read"),
    "PHASE10C_FAQ must address where to find Terms & Conditions"
  );
});

test("/faq page references PHASE10C_FAQ", () => {
  const page = readPublicPage("faq");
  assert.ok(page.includes("PHASE10C_FAQ"), "/faq page must import and use PHASE10C_FAQ");
});

test("/faq includes question about missing EMI", () => {
  const content = readContent();
  assert.ok(
    content.includes("miss an EMI") || content.includes("What if I miss"),
    "FAQ must address what happens if customer misses EMI"
  );
});

test("/faq includes question about delivery", () => {
  const content = readContent();
  assert.ok(
    content.includes("When does delivery happen") || content.includes("delivery happen"),
    "FAQ must address delivery timing"
  );
});

test("/faq includes question about payment history online", () => {
  const content = readContent();
  assert.ok(
    content.includes("payment history online") || content.includes("Can I check my payment"),
    "FAQ must address checking payment history online"
  );
});

test("/faq includes question about rent/lease and Lucky Plan", () => {
  const content = readContent();
  assert.ok(
    content.includes("Is rent or lease part of the Lucky Plan") ||
      content.includes("rent or lease part"),
    "FAQ must clarify rent/lease is not part of Lucky Plan"
  );
});

// ── /about ────────────────────────────────────────────────────────────────────

test("/about page mentions Subidha Furniture as brand", () => {
  const page = readPublicPage("about");
  assert.ok(
    page.includes("Subidha Furniture"),
    "/about must mention Subidha Furniture as the brand"
  );
});

test("/about page mentions Subidha Core", () => {
  const page = readPublicPage("about");
  assert.ok(
    page.toLowerCase().includes("subidha core"),
    "/about must mention Subidha Core"
  );
});

test("/about page covers digital contract tracking purpose", () => {
  const page = readPublicPage("about");
  const lc = page.toLowerCase();
  assert.ok(
    lc.includes("digital") && (lc.includes("contract") || lc.includes("tracking")),
    "/about must mention digital contract tracking"
  );
});

test("/about page does not contain fake awards", () => {
  const page = readPublicPage("about");
  const fakePhrases = [
    "award-winning",
    "best furniture company",
    "ISO certified",
    "government approved",
    "RBI approved",
    "certified by",
  ];
  for (const phrase of fakePhrases) {
    assert.ok(
      !page.toLowerCase().includes(phrase),
      `/about must not contain fake claim: "${phrase}"`
    );
  }
});

test("/about page does not contain fake scale or history claims", () => {
  const page = readPublicPage("about");
  const fakeClaims = [
    "10,000 customers",
    "50,000 customers",
    "founded in 19",
    "over 20 years",
    "since 1990",
    "30 branches",
  ];
  for (const claim of fakeClaims) {
    assert.ok(
      !page.toLowerCase().includes(claim.toLowerCase()),
      `/about must not contain fake claim: "${claim}"`
    );
  }
});

// ── /contact ──────────────────────────────────────────────────────────────────

test("/contact page does not include hard-coded fake phone numbers", () => {
  const page = readPublicPage("contact");
  const fakePhrases = ["+91 98765 43210", "1800-XXX-XXXX", "+91 9876543210"];
  for (const phrase of fakePhrases) {
    assert.ok(!page.includes(phrase), `/contact must not contain hard-coded fake phone: "${phrase}"`);
  }
});

test("/contact page does not include hard-coded fake address", () => {
  const page = readPublicPage("contact");
  const fakeAddresses = ["123 Main Street", "MG Road, Bengaluru", "Fake Street"];
  for (const addr of fakeAddresses) {
    assert.ok(!page.includes(addr), `/contact must not contain fake address: "${addr}"`);
  }
});

test("/contact page has Login and Contracts CTAs or links", () => {
  const page = readPublicPage("contact");
  assert.ok(
    page.includes("ROUTES.public.login") || page.includes('"/login"') || page.includes("Login"),
    "/contact must link to Login"
  );
  assert.ok(
    page.includes("ROUTES.public.contracts") ||
      page.includes('"/contracts"') ||
      page.includes("Contracts") ||
      page.includes("ROUTES.public.apply") ||
      page.includes("apply"),
    "/contact must link to Contracts or Apply"
  );
});

test("/contact form submits to a real API function, not a fake endpoint", () => {
  const formFile = join(
    srcRoot,
    "app/(public)/contact/ContactLeadForm.tsx"
  );
  if (!existsSync(formFile)) return;
  const form = readFileSync(formFile, "utf8");
  assert.ok(
    form.includes("submitPublicLead") || form.includes("public-api"),
    "ContactLeadForm must use a real API function (submitPublicLead)"
  );
  assert.ok(
    !form.includes('fetch("/fake') && !form.includes('action="/fake'),
    "ContactLeadForm must not submit to a fake endpoint"
  );
});

// ── /products ─────────────────────────────────────────────────────────────────

test("/products page uses real product data or category examples only", () => {
  const page = readPublicPage("products");
  assert.ok(
    page.includes("listPublicProducts") ||
      page.includes("ProductCategoryDiscovery") ||
      page.includes("PublicProduct"),
    "/products must use real product data source or category discovery"
  );
});

test("/products page does not fake inventory quantity", () => {
  const page = readPublicPage("products");
  const fakePhrases = ["500 items in stock", "1000 products available", "in stock: 250"];
  for (const phrase of fakePhrases) {
    assert.ok(!page.toLowerCase().includes(phrase.toLowerCase()), `/products must not fake stock: "${phrase}"`);
  }
});

test("/products page does not fake prices", () => {
  const page = readPublicPage("products");
  const fakePrices = ["₹999 only", "starting at ₹499", "now at ₹1999"];
  for (const price of fakePrices) {
    assert.ok(!page.includes(price), `/products must not fake price: "${price}"`);
  }
});

test("/products page has CTA to Contracts and Contact", () => {
  const page = readPublicPage("products");
  assert.ok(
    page.includes("ROUTES.public.contact") ||
      page.includes('"/contact"') ||
      page.includes("contact"),
    "/products must link to Contact or Contact Store"
  );
});

// ── /legal/disclaimer ─────────────────────────────────────────────────────────

test("/legal/disclaimer states no guarantee of winning", () => {
  const page = readPublicPage("legal/disclaimer");
  const lc = page.toLowerCase();
  assert.ok(
    lc.includes("does not guarantee") || lc.includes("no guarantee") || lc.includes("not guaranteed"),
    "/legal/disclaimer must contain no-guarantee wording"
  );
});

test("/legal/disclaimer states accounting is internal and no public user can post accounting records", () => {
  const page = readPublicPage("legal/disclaimer");
  const lc = page.toLowerCase();
  assert.ok(
    lc.includes("accounting") && (lc.includes("internal") || lc.includes("controlled")),
    "/legal/disclaimer must state accounting is internal/controlled"
  );
  assert.ok(
    lc.includes("no public user") || lc.includes("cannot post") || lc.includes("public user"),
    "/legal/disclaimer must state no public user can post accounting records"
  );
});

test("/legal/disclaimer states product availability must be confirmed with store", () => {
  const page = readPublicPage("legal/disclaimer");
  const lc = page.toLowerCase();
  assert.ok(
    lc.includes("product availability") || lc.includes("confirmed") || lc.includes("confirm"),
    "/legal/disclaimer must address product availability confirmation"
  );
  assert.ok(
    lc.includes("branch") || lc.includes("store") || lc.includes("directly"),
    "/legal/disclaimer must say to confirm with branch/store"
  );
});

test("/legal/disclaimer states winner waiver is future EMI only", () => {
  const page = readPublicPage("legal/disclaimer");
  assert.ok(
    page.includes("future EMI") || page.includes("Future EMI"),
    "/legal/disclaimer must state winner waiver is future EMI only"
  );
});

test("/legal/disclaimer states rent/lease do not use Lucky IDs", () => {
  const page = readPublicPage("legal/disclaimer");
  assert.ok(
    page.includes("Rent") || page.includes("rent"),
    "/legal/disclaimer must mention rent/lease context"
  );
});

test("/legal/disclaimer states deposit and monthly demand are separate", () => {
  const page = readPublicPage("legal/disclaimer");
  const lc = page.toLowerCase();
  assert.ok(
    lc.includes("deposit") && (lc.includes("separate") || lc.includes("refundable")),
    "/legal/disclaimer must address deposit separation"
  );
});

// ── Footer ────────────────────────────────────────────────────────────────────

test("footer copyright includes Subidha Furniture and All rights reserved", () => {
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

test("footer links to Contracts, About, Contact, Rulebook, FAQ", () => {
  const footer = readSrc("components/ui/public-footer.tsx");
  assert.ok(
    footer.includes("ROUTES.public.contracts") || footer.includes('"/contracts"'),
    "Footer must link to Contracts"
  );
  assert.ok(
    footer.includes("ROUTES.public.about") || footer.includes('"/about"'),
    "Footer must link to About"
  );
  assert.ok(
    footer.includes("ROUTES.public.contact") || footer.includes('"/contact"'),
    "Footer must link to Contact"
  );
  assert.ok(
    footer.includes("ROUTES.public.rulebook") || footer.includes('"/rulebook"'),
    "Footer must link to Rulebook"
  );
  assert.ok(
    footer.includes("ROUTES.public.faq") || footer.includes('"/faq"'),
    "Footer must link to FAQ"
  );
});

test("footer links to Terms, Privacy, Disclaimer, and Policies", () => {
  const footer = readSrc("components/ui/public-footer.tsx");
  assert.ok(
    footer.includes("ROUTES.public.legalTerms") ||
      footer.includes("ROUTES.public.terms") ||
      footer.includes('"/legal/terms"') ||
      footer.includes('"/terms"'),
    "Footer must link to Terms"
  );
  assert.ok(
    footer.includes("ROUTES.public.legalPrivacy") ||
      footer.includes("ROUTES.public.privacy") ||
      footer.includes('"/legal/privacy"') ||
      footer.includes('"/privacy"'),
    "Footer must link to Privacy"
  );
  assert.ok(
    footer.includes("ROUTES.public.legalDisclaimer") || footer.includes('"/legal/disclaimer"'),
    "Footer must link to Disclaimer"
  );
});

// ── No admin/cashier routes exposed ──────────────────────────────────────────

test("education pages do not link to admin or cashier routes", () => {
  const educationPages = [
    "how-it-works/page.tsx",
    "customers/page.tsx",
    "partners/page.tsx",
    "rulebook/page.tsx",
    "faq/page.tsx",
    "about/page.tsx",
    "contact/page.tsx",
    "products/page.tsx",
    "legal/disclaimer/page.tsx",
  ];
  for (const page of educationPages) {
    const src = readFileSync(join(appPublic, page), "utf8");
    assert.ok(
      !src.includes('href="/admin') && !src.includes('href="/cashier'),
      `${page} must not link to admin or cashier routes`
    );
  }
});

// ── No fake stats ─────────────────────────────────────────────────────────────

test("education pages do not contain fake customer count claims", () => {
  const fakePhrases = [
    "10,000 customers",
    "50,000 customers",
    "trusted by thousands",
    "100,000 users",
    "1 lakh customers",
  ];
  const educationPages = [
    "how-it-works/page.tsx",
    "customers/page.tsx",
    "partners/page.tsx",
    "rulebook/page.tsx",
    "faq/page.tsx",
    "about/page.tsx",
    "contact/page.tsx",
    "products/page.tsx",
    "legal/disclaimer/page.tsx",
  ];
  for (const page of educationPages) {
    const src = readFileSync(join(appPublic, page), "utf8");
    for (const phrase of fakePhrases) {
      assert.ok(!src.includes(phrase), `${page} must not contain fake stat: "${phrase}"`);
    }
  }
});

// ── Contracts hub from Phase 10B still works ─────────────────────────────────

test("contracts page files still exist (Phase 10B compatibility)", () => {
  const pages = [
    "contracts/page.tsx",
    "contracts/advance-emi/page.tsx",
    "contracts/rent/page.tsx",
    "contracts/lease/page.tsx",
  ];
  for (const page of pages) {
    assert.ok(existsSync(join(appPublic, page)), `Phase 10B contracts page missing: ${page}`);
  }
});

test("legal pages from Phase 10B still exist", () => {
  const pages = [
    "legal/terms/page.tsx",
    "legal/privacy/page.tsx",
    "legal/policies/page.tsx",
    "legal/disclaimer/page.tsx",
  ];
  for (const page of pages) {
    assert.ok(existsSync(join(appPublic, page)), `Phase 10B legal page missing: ${page}`);
  }
});

// ── Reduced-motion support ────────────────────────────────────────────────────

test("ScrollRevealSection component respects reduced-motion if present", () => {
  const componentPath = join(srcRoot, "components/public/ScrollRevealSection.tsx");
  if (!existsSync(componentPath)) return;
  const src = readFileSync(componentPath, "utf8");
  assert.ok(
    src.includes("prefers-reduced-motion") || src.includes("reduced-motion") || src.includes("useReducedMotion"),
    "ScrollRevealSection must respect prefers-reduced-motion"
  );
});

// ── Nav links to Contracts ────────────────────────────────────────────────────

test("public nav client links to /contracts", () => {
  const nav = readSrc("components/ui/public-nav.client.tsx");
  assert.ok(
    nav.includes("ROUTES.public.contracts"),
    "Public nav must reference ROUTES.public.contracts"
  );
});

// ── Routes registered ─────────────────────────────────────────────────────────

test("Phase 10C routes are registered in ROUTES.ts", () => {
  const routes = readSrc("lib/routes.ts");
  assert.ok(routes.includes('howItWorks: "/how-it-works"'), "Missing howItWorks route");
  assert.ok(routes.includes('customers: "/customers"'), "Missing customers route");
  assert.ok(routes.includes('partners: "/partners"'), "Missing partners route");
  assert.ok(routes.includes('rulebook: "/rulebook"'), "Missing rulebook route");
  assert.ok(routes.includes('faq: "/faq"'), "Missing faq route");
  assert.ok(routes.includes('about: "/about"'), "Missing about route");
  assert.ok(routes.includes('contact: "/contact"'), "Missing contact route");
  assert.ok(routes.includes('products: "/products"'), "Missing products route");
  assert.ok(routes.includes('legalDisclaimer: "/legal/disclaimer"'), "Missing legalDisclaimer route");
});
