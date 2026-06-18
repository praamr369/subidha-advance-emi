/**
 * Phase 9E — Readiness-Gated Action UX guard tests.
 *
 * Asserts:
 *  1.  ReadinessGatedActionBanner component file exists.
 *  2.  Banner exports the component.
 *  3.  Banner handles the "activation" stage.
 *  4.  Banner handles the "handover" stage.
 *  5.  Banner renders "Readiness not evaluated" when readiness is absent.
 *  6.  Banner renders "Blocked by readiness" copy when blocked.
 *  7.  Banner renders "Handover blockers" copy for handover stage.
 *  8.  Banner renders "Activation blockers" copy for activation stage.
 *  9.  No unsafe bypass labels in the banner.
 * 10.  Subscription detail page imports ReadinessGatedActionBanner.
 * 11.  Subscription detail page renders the activation gate.
 * 12.  Subscription detail page renders the handover gate.
 * 13.  Subscription detail page renders readiness-action-gate-summary container.
 * 14.  Delivery section of subscription detail shows handover gate.
 * 15.  Delivery workspace page contains readiness note.
 * 16.  Delivery workspace page links to subscription detail for readiness.
 * 17.  Subscription list page does not fake per-row readiness (9D compat).
 * 18.  Banner includes "Backend readiness check remains authoritative" copy.
 * 19.  Banner includes safe no-payment/receipt/journal copy.
 * 20.  No route ownership flip occurred.
 * 21.  9D panel still present on subscription detail (non-regression).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const appRoot = join(rootDir, "src/app/(dashboard)/admin");
const componentsRoot = join(rootDir, "src/components");

const bannerPath = join(componentsRoot, "subscriptions/ReadinessGatedActionBanner.tsx");
const panelPath = join(componentsRoot, "subscriptions/ContractActivationReadinessPanel.tsx");
const subscriptionDetailPath = join(appRoot, "subscriptions/[id]/page.tsx");
const subscriptionListPath = join(appRoot, "subscriptions/page.tsx");
const deliveriesPath = join(appRoot, "deliveries/page.tsx");

const readFile = (path: string) => readFileSync(path, "utf8");

// ── 1. Component existence ────────────────────────────────────────────────────

test("Phase 9E: ReadinessGatedActionBanner component file exists", () => {
  assert.ok(
    existsSync(bannerPath),
    "ReadinessGatedActionBanner.tsx must exist in src/components/subscriptions/"
  );
});

test("Phase 9E: ReadinessGatedActionBanner exports the component", () => {
  const src = readFile(bannerPath);
  assert.ok(
    src.includes("ReadinessGatedActionBanner"),
    "Banner must export ReadinessGatedActionBanner"
  );
  assert.ok(
    src.includes("export function ReadinessGatedActionBanner"),
    "Banner must use named export"
  );
});

// ── 2. Stage handling ────────────────────────────────────────────────────────

test("Phase 9E: Banner handles activation stage", () => {
  const src = readFile(bannerPath);
  assert.ok(
    src.includes('"activation"') || src.includes("activation"),
    "Banner must handle activation stage"
  );
  assert.ok(
    src.includes("Activation blockers") || src.includes("activation_blockers"),
    "Banner must reference Activation blockers for activation stage"
  );
});

test("Phase 9E: Banner handles handover stage", () => {
  const src = readFile(bannerPath);
  assert.ok(
    src.includes('"handover"') || src.includes("handover"),
    "Banner must handle handover stage"
  );
  assert.ok(
    src.includes("Handover blockers") || src.includes("handover_blockers"),
    "Banner must reference Handover blockers for handover stage"
  );
});

// ── 3. Readiness-not-evaluated state ─────────────────────────────────────────

test("Phase 9E: Banner shows Readiness not evaluated when readiness is absent", () => {
  const src = readFile(bannerPath);
  assert.ok(
    src.includes("Readiness not evaluated"),
    "Banner must show 'Readiness not evaluated' when readiness prop is null/undefined"
  );
});

test("Phase 9E: Readiness not evaluated copy includes readiness-on-subscription-detail note", () => {
  const src = readFile(bannerPath);
  assert.ok(
    src.includes("Contract readiness is evaluated on subscription detail"),
    "Readiness-not-evaluated state must note that readiness is evaluated on subscription detail"
  );
});

// ── 4. Blocked state copy ─────────────────────────────────────────────────────

test("Phase 9E: Banner renders Blocked by readiness copy when gated", () => {
  const src = readFile(bannerPath);
  assert.ok(
    src.includes("Blocked by readiness"),
    "Banner must include 'Blocked by readiness' label in blocked state"
  );
});

test("Phase 9E: Banner renders Activation blockers label for activation stage", () => {
  const src = readFile(bannerPath);
  assert.ok(
    src.includes("Activation blockers"),
    "Banner must render 'Activation blockers' label"
  );
});

test("Phase 9E: Banner renders Handover blockers label for handover stage", () => {
  const src = readFile(bannerPath);
  assert.ok(
    src.includes("Handover blockers"),
    "Banner must render 'Handover blockers' label"
  );
});

// ── 5. Safe labels only ───────────────────────────────────────────────────────

test("Phase 9E: Banner does not contain unsafe bypass action labels", () => {
  const src = readFile(bannerPath);
  const unsafePatterns = [
    /Force\s+activate/i,
    /Bypass/i,
    /Mark\s+ready/i,
    /Override/i,
    /Post\s+anyway/i,
    /Deliver\s+anyway/i,
    /Reconcile\b/i,
  ];
  for (const pattern of unsafePatterns) {
    assert.ok(
      !pattern.test(src),
      `Banner must not contain unsafe label matching: ${pattern.source}`
    );
  }
});

test("Phase 9E: Banner includes Backend readiness check remains authoritative copy", () => {
  const src = readFile(bannerPath);
  assert.ok(
    src.includes("Backend readiness check remains authoritative"),
    "Banner must state that backend readiness check remains authoritative"
  );
});

test("Phase 9E: Banner includes no-payment/receipt/journal safe copy", () => {
  const src = readFile(bannerPath);
  assert.ok(
    src.includes("No payment") ||
      src.includes("no payment") ||
      src.includes("receipt"),
    "Banner must state that no payment, receipt, or journal record is created from this action area"
  );
});

// ── 6. Subscription detail page integration ───────────────────────────────────

test("Phase 9E: Subscription detail page imports ReadinessGatedActionBanner", () => {
  const src = readFile(subscriptionDetailPath);
  assert.ok(
    src.includes("ReadinessGatedActionBanner"),
    "Subscription detail page must import ReadinessGatedActionBanner"
  );
});

test("Phase 9E: Subscription detail page renders activation gate", () => {
  const src = readFile(subscriptionDetailPath);
  assert.ok(
    src.includes('stage="activation"'),
    'Subscription detail page must render <ReadinessGatedActionBanner stage="activation">'
  );
});

test("Phase 9E: Subscription detail page renders handover gate", () => {
  const src = readFile(subscriptionDetailPath);
  assert.ok(
    src.includes('stage="handover"'),
    'Subscription detail page must render <ReadinessGatedActionBanner stage="handover">'
  );
  const handoverCount = (src.match(/stage="handover"/g) || []).length;
  assert.ok(
    handoverCount >= 2,
    "Subscription detail page must render handover gate in at least two places (readiness panel + delivery section)"
  );
});

test("Phase 9E: Subscription detail page renders readiness-action-gate-summary container", () => {
  const src = readFile(subscriptionDetailPath);
  assert.ok(
    src.includes("readiness-action-gate-summary"),
    "Subscription detail page must include readiness-action-gate-summary container"
  );
});

// ── 7. Delivery section gating ────────────────────────────────────────────────

test("Phase 9E: Subscription detail delivery section shows handover gate before action links", () => {
  const src = readFile(subscriptionDetailPath);
  const deliveryIdx = src.indexOf("Open Delivery Detail");
  const gateIdx = src.indexOf('stage="handover"');
  assert.ok(deliveryIdx > -1, "Subscription detail must have Open Delivery Detail link");
  assert.ok(gateIdx > -1, "Subscription detail must have handover gate");
  assert.ok(
    gateIdx < deliveryIdx,
    "Handover gate must appear before the Open Delivery Detail link"
  );
});

test("Phase 9E: Subscription detail delivery section shows handover gate in empty state", () => {
  const src = readFile(subscriptionDetailPath);
  assert.ok(
    src.includes("No delivery record exists for this subscription yet") &&
      src.includes('stage="handover"'),
    "Subscription detail must show handover gate in the delivery empty state"
  );
});

// ── 8. Delivery workspace ──────────────────────────────────────────────────────

test("Phase 9E: Delivery workspace page contains readiness note", () => {
  const src = readFile(deliveriesPath);
  assert.ok(
    src.includes("Contract readiness is evaluated on subscription detail"),
    "Delivery workspace must state that contract readiness is evaluated on subscription detail"
  );
});

test("Phase 9E: Delivery workspace includes View readiness details link to subscription", () => {
  const src = readFile(deliveriesPath);
  assert.ok(
    src.includes("/admin/subscriptions/") && src.includes("View readiness details"),
    "Delivery workspace must link to subscription detail for readiness"
  );
});

test("Phase 9E: Delivery workspace includes backend remains authoritative copy", () => {
  const src = readFile(deliveriesPath);
  assert.ok(
    src.includes("Backend readiness check remains authoritative"),
    "Delivery workspace must state that backend readiness check remains authoritative"
  );
});

// ── 9. Subscription list page ─────────────────────────────────────────────────

test("Phase 9E: Subscription list page does not fake per-row readiness badges", () => {
  const src = readFile(subscriptionListPath);
  assert.ok(
    !src.includes("readiness_status") || src.includes("Contract readiness is evaluated"),
    "Subscription list must not fake per-row readiness (detail-only per Phase 9D)"
  );
});

// ── 10. Non-regression: 9D panel still present ────────────────────────────────

test("Phase 9E: Phase 9D ContractActivationReadinessPanel still rendered on detail page", () => {
  const src = readFile(subscriptionDetailPath);
  assert.ok(
    src.includes("<ContractActivationReadinessPanel"),
    "ContractActivationReadinessPanel must still be rendered on subscription detail (9D non-regression)"
  );
});

test("Phase 9E: Phase 9D ContractActivationReadinessPanel file still exists", () => {
  assert.ok(
    existsSync(panelPath),
    "ContractActivationReadinessPanel.tsx must still exist (9D non-regression)"
  );
});

// ── 11. Route ownership check ─────────────────────────────────────────────────

test("Phase 9E: Subscription detail route was not flipped", () => {
  assert.ok(
    existsSync(subscriptionDetailPath),
    "/admin/subscriptions/[id]/page.tsx must still exist — no route ownership flip"
  );
  const src = readFile(subscriptionDetailPath);
  assert.ok(
    !src.includes('redirect("/admin/'),
    "Subscription detail page must not redirect to a different route"
  );
});

test("Phase 9E: Subscription list route was not flipped", () => {
  assert.ok(
    existsSync(subscriptionListPath),
    "/admin/subscriptions/page.tsx must still exist — no route ownership flip"
  );
});
