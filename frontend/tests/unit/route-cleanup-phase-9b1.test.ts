/**
 * Phase 9B.1 — Canonical Alias Flip Plan lock tests.
 *
 * Phase 9B.1 is PLANNING + a first safe lock only. It writes the migration plan
 * and freezes the current (pre-flip) route topology. These tests prove that
 * Phase 9B.1 did NOT:
 *   - delete a canonical alias page,
 *   - delete a legacy content-owner page,
 *   - delete any future-`delete_later` legacy route,
 *   - flip a redirect direction (canonical pages must still redirect to legacy),
 *   - flip the finance / lucky-plan / requests families.
 *
 * They also assert the plan document exists. All assertions are
 * file-content / file-existence based (no module imports), so they run under raw
 * `node --test frontend/tests/unit/*.test.ts`.
 *
 * See: docs/architecture/admin-canonical-alias-flip-plan.md
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const appRoot = join(thisFileDir, "../../src/app/(dashboard)/admin");
const repoRoot = join(thisFileDir, "../../..");
const pagePath = (rel: string) => join(appRoot, rel, "page.tsx");
const readPage = (rel: string) => readFileSync(pagePath(rel), "utf8");

// The four alias families, mapped canonical-alias → legacy content owner.
// This is the CURRENT (pre-flip) direction that Phase 9B.1 must preserve.
const ALIAS_TO_LEGACY: Record<string, string> = {
  // Profiles & Parties
  "profiles/customers": "/admin/customers",
  "profiles/partners": "/admin/partners",
  "profiles/vendors": "/admin/vendors",
  "profiles/staff": "/admin/hr/staff",
  "profiles/branches": "/admin/branches",
  "profiles/parties": "/admin/crm/parties",
  // Lucky Plan Control
  "lucky-plan/batches": "/admin/batches",
  "lucky-plan/lucky-ids": "/admin/lucky-ids",
  "lucky-plan/draws": "/admin/lucky-draws",
  // Finance Operations
  "finance/outstandings": "/admin/outstandings",
  "finance/customer-advances": "/admin/customer-advances",
  // CRM & Requests
  "requests/online-enquiries": "/admin/online-enquiries",
  "requests/support": "/admin/support-requests",
  "requests/subscriptions": "/admin/subscription-requests",
};

// Legacy content-owner pages that still host the real page today. After a future
// flip these become the compatibility aliases (and only much later, with
// approval, `delete_later`). Phase 9B.1 must keep every one of them on disk.
const LEGACY_CONTENT_PAGES = [
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
  "online-enquiries",
  "support-requests",
  "subscription-requests",
];

// ── 1. Canonical alias pages exist ─────────────────────────────────────────────

test("Phase 9B.1: every canonical alias page exists", () => {
  for (const rel of Object.keys(ALIAS_TO_LEGACY)) {
    assert.ok(existsSync(pagePath(rel)), `Canonical alias page must exist: /admin/${rel}`);
  }
});

// ── 2. Legacy content-owner pages still exist ──────────────────────────────────

test("Phase 9B.1: every legacy content-owner page still exists", () => {
  for (const rel of LEGACY_CONTENT_PAGES) {
    assert.ok(existsSync(pagePath(rel)), `Legacy content-owner page must remain: /admin/${rel}`);
  }
});

// ── 3. No delete_later route is currently deleted ──────────────────────────────
//
// Per Phase 9A: no path is `delete_later` yet. The legacy paths are the FUTURE
// `delete_later` candidates (only after their content moves and the alias
// redirects through a release cycle). Phase 9B.1 deletes none of them.

test("Phase 9B.1: no delete_later candidate route has been deleted", () => {
  for (const rel of LEGACY_CONTENT_PAGES) {
    assert.ok(
      existsSync(pagePath(rel)),
      `No legacy route may be deleted in Phase 9B.1 (future delete_later candidate): /admin/${rel}`
    );
  }
});

// ── 4. Phase 9B.1 does not flip route direction yet ────────────────────────────
//
// The canonical pages must STILL be thin redirects pointing at the legacy
// content owner. A flip would mean the canonical page renders real content and
// the legacy page redirects — that is Phase 9B.2+, not 9B.1.

test("Phase 9B.1: canonical pages still redirect to legacy (direction not flipped)", () => {
  for (const [rel, target] of Object.entries(ALIAS_TO_LEGACY)) {
    const src = readPage(rel);
    assert.ok(src.includes("redirect("), `/admin/${rel} must still be a thin redirect alias`);
    assert.ok(
      src.includes(`redirect("${target}")`),
      `/admin/${rel} must still redirect to legacy ${target} (not flipped)`
    );
  }
});

test("Phase 9B.1: legacy content-owner pages are NOT redirects back to canonical", () => {
  // If a legacy page had been turned into a redirect to its canonical route, the
  // flip would already be (partially) done. Guard against that.
  const legacyToCanonical: Record<string, string> = {
    customers: "/admin/profiles/customers",
    partners: "/admin/profiles/partners",
    branches: "/admin/profiles/branches",
    "crm/parties": "/admin/profiles/parties",
    batches: "/admin/lucky-plan/batches",
    "lucky-ids": "/admin/lucky-plan/lucky-ids",
    "lucky-draws": "/admin/lucky-plan/draws",
    outstandings: "/admin/finance/outstandings",
    "customer-advances": "/admin/finance/customer-advances",
    "online-enquiries": "/admin/requests/online-enquiries",
    "support-requests": "/admin/requests/support",
    "subscription-requests": "/admin/requests/subscriptions",
  };
  for (const [rel, canonical] of Object.entries(legacyToCanonical)) {
    const src = readPage(rel);
    assert.ok(
      !src.includes(`redirect("${canonical}")`),
      `/admin/${rel} must NOT yet redirect to canonical ${canonical} (no flip in Phase 9B.1)`
    );
  }
});

// ── 5. Migration plan document exists ──────────────────────────────────────────

test("Phase 9B.1: canonical alias flip plan document exists", () => {
  const planDoc = join(repoRoot, "docs/architecture/admin-canonical-alias-flip-plan.md");
  assert.ok(existsSync(planDoc), "Phase 9B.1 plan doc must exist: admin-canonical-alias-flip-plan.md");
  const doc = readFileSync(planDoc, "utf8");
  assert.ok(doc.includes("Phase 9B.1"), "plan doc must identify itself as Phase 9B.1");
  assert.ok(doc.includes("Canonical Alias Flip Plan"), "plan doc must be the Canonical Alias Flip Plan");
  // Migration order must be documented in the prescribed sequence.
  const profilesIdx = doc.indexOf("Profiles & Parties");
  const requestsIdx = doc.indexOf("CRM & Requests");
  const luckyIdx = doc.indexOf("Lucky Plan Control");
  const financeIdx = doc.indexOf("Finance Operations");
  assert.ok(
    profilesIdx !== -1 && requestsIdx !== -1 && luckyIdx !== -1 && financeIdx !== -1,
    "plan doc must classify all four alias families"
  );
});

// ── 6. Finance aliases are not flipped in this phase ───────────────────────────

test("Phase 9B.1: finance aliases are not flipped", () => {
  const finance = ["finance/outstandings", "finance/customer-advances"];
  for (const rel of finance) {
    const src = readPage(rel);
    assert.ok(src.includes("redirect("), `/admin/${rel} must still be a thin redirect (finance not flipped)`);
    assert.ok(
      src.includes(`redirect("${ALIAS_TO_LEGACY[rel]}")`),
      `/admin/${rel} must still redirect to legacy ${ALIAS_TO_LEGACY[rel]}`
    );
  }
});

// ── 7. Lucky-plan aliases are not flipped in this phase ────────────────────────

test("Phase 9B.1: lucky-plan aliases are not flipped", () => {
  const lucky = ["lucky-plan/batches", "lucky-plan/lucky-ids", "lucky-plan/draws"];
  for (const rel of lucky) {
    const src = readPage(rel);
    assert.ok(src.includes("redirect("), `/admin/${rel} must still be a thin redirect (lucky-plan not flipped)`);
    assert.ok(
      src.includes(`redirect("${ALIAS_TO_LEGACY[rel]}")`),
      `/admin/${rel} must still redirect to legacy ${ALIAS_TO_LEGACY[rel]}`
    );
  }
});

// ── 8. Requests aliases are not flipped in this phase ──────────────────────────

test("Phase 9B.1: requests aliases are not flipped", () => {
  const requests = ["requests/online-enquiries", "requests/support", "requests/subscriptions"];
  for (const rel of requests) {
    const src = readPage(rel);
    assert.ok(src.includes("redirect("), `/admin/${rel} must still be a thin redirect (requests not flipped)`);
    assert.ok(
      src.includes(`redirect("${ALIAS_TO_LEGACY[rel]}")`),
      `/admin/${rel} must still redirect to legacy ${ALIAS_TO_LEGACY[rel]}`
    );
  }
});
