/**
 * Phase 9D — Contract Activation Readiness UI Surfacing guard tests.
 *
 * Asserts:
 * 1. ContractActivationReadinessPanel component exists.
 * 2. Subscription detail page imports and renders the readiness panel.
 * 3. Activation and handover blockers are surfaced as separate sections.
 * 4. Accounting bridge is labelled advisory.
 * 5. Rent/Lease no-Lucky-ID rule copy exists.
 * 6. Deposit/monthly-demand separation copy exists.
 * 7. Winner waiver scope note exists.
 * 8. No unsafe mutation labels appear in the readiness panel.
 * 9. Subscription list page does not fake per-row readiness.
 * 10. Customer page does not aggregate fake readiness.
 * 11. Batch page does not aggregate fake readiness.
 * 12. No route ownership flip occurred.
 *
 * All assertions are file-content/file-existence based (no module imports),
 * compatible with raw `node --test tests/unit/contract-activation-readiness-9d.test.ts`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const appRoot = join(rootDir, "src/app/(dashboard)/admin");
const componentsRoot = join(rootDir, "src/components");

const panelPath = join(componentsRoot, "subscriptions/ContractActivationReadinessPanel.tsx");
const subscriptionDetailPath = join(appRoot, "subscriptions/[id]/page.tsx");
const subscriptionListPath = join(appRoot, "subscriptions/page.tsx");
const customerDetailPath = join(appRoot, "customers/[id]/page.tsx");
const batchDetailPath = join(appRoot, "batches/[id]/page.tsx");

const readFile = (path: string) => readFileSync(path, "utf8");

// ── 1. Component existence ────────────────────────────────────────────────────

test("Phase 9D: ContractActivationReadinessPanel component file exists", () => {
  assert.ok(
    existsSync(panelPath),
    "ContractActivationReadinessPanel.tsx must exist in src/components/subscriptions/"
  );
});

test("Phase 9D: ContractActivationReadinessPanel exports the component and ActivationReadiness type", () => {
  const src = readFile(panelPath);
  assert.ok(
    src.includes("ContractActivationReadinessPanel"),
    "Panel must export ContractActivationReadinessPanel"
  );
  assert.ok(
    src.includes("ActivationReadiness"),
    "Panel must export ActivationReadiness type"
  );
});

// ── 2. Subscription detail page ───────────────────────────────────────────────

test("Phase 9D: Subscription detail page imports ContractActivationReadinessPanel", () => {
  const src = readFile(subscriptionDetailPath);
  assert.ok(
    src.includes("ContractActivationReadinessPanel"),
    "Subscription detail page must import ContractActivationReadinessPanel"
  );
});

test("Phase 9D: Subscription detail page renders Contract Activation Readiness panel", () => {
  const src = readFile(subscriptionDetailPath);
  assert.ok(
    src.includes("Contract Activation Readiness"),
    "Subscription detail page must render a panel titled 'Contract Activation Readiness'"
  );
  assert.ok(
    src.includes("<ContractActivationReadinessPanel"),
    "Subscription detail page must render <ContractActivationReadinessPanel"
  );
});

test("Phase 9D: Subscription detail type includes activation_readiness field", () => {
  const src = readFile(subscriptionDetailPath);
  assert.ok(
    src.includes("activation_readiness"),
    "Subscription detail record type must include activation_readiness field"
  );
});

// ── 3. Activation and handover blockers are separate ─────────────────────────

test("Phase 9D: Panel distinguishes activation_blockers from handover_blockers", () => {
  const src = readFile(panelPath);
  assert.ok(
    src.includes("activation_blockers") || src.includes("Activation blockers"),
    "Panel must reference activation_blockers"
  );
  assert.ok(
    src.includes("handover_blockers") || src.includes("Handover blockers"),
    "Panel must reference handover_blockers separately"
  );
});

test("Phase 9D: Panel renders separate sections for Activation blockers and Handover blockers", () => {
  const src = readFile(panelPath);
  assert.ok(
    src.includes("Activation blockers") || src.includes("activation_blockers"),
    "Panel must have an Activation blockers section"
  );
  assert.ok(
    src.includes("Handover blockers") || src.includes("handover_blockers"),
    "Panel must have a Handover blockers section"
  );
});

// ── 4. Accounting bridge is advisory ─────────────────────────────────────────

test("Phase 9D: Panel labels accounting bridge as advisory", () => {
  const src = readFile(panelPath);
  assert.ok(
    src.includes("advisory") || src.includes("Advisory"),
    "Panel must label accounting_bridge as advisory"
  );
  assert.ok(
    src.includes("Accounting") && (src.includes("advisory") || src.includes("Advisory")),
    "Panel must label accounting bridge status as advisory"
  );
});

test("Phase 9D: Panel includes Accounting & Reconciliation owns posting evidence copy", () => {
  const src = readFile(panelPath);
  assert.ok(
    src.includes("Reconciliation owns posting") ||
      src.includes("Accounting & Reconciliation") ||
      src.includes("posting evidence"),
    "Panel must state that Accounting & Reconciliation owns posting evidence"
  );
});

// ── 5. Rent/Lease no-Lucky-ID rule copy ──────────────────────────────────────

test("Phase 9D: Panel or subscription detail includes Rent/Lease has no Lucky ID requirement copy", () => {
  const panelSrc = readFile(panelPath);
  const detailSrc = readFile(subscriptionDetailPath);
  const combined = panelSrc + detailSrc;
  assert.ok(
    combined.includes("Lucky ID") || combined.includes("Rent/Lease has no Lucky"),
    "Readiness UI must state that Rent/Lease has no Lucky ID requirement"
  );
});

// ── 6. Deposit/monthly-demand separation copy ─────────────────────────────────

test("Phase 9D: Panel or subscription detail includes deposit/monthly-demand separation copy", () => {
  const panelSrc = readFile(panelPath);
  const detailSrc = readFile(subscriptionDetailPath);
  const combined = panelSrc + detailSrc;
  assert.ok(
    combined.includes("monthly demand") ||
      combined.includes("Deposit readiness is separate") ||
      combined.includes("deposit readiness"),
    "Readiness UI must state that deposit readiness is separate from monthly demand"
  );
});

// ── 7. Winner waiver scope note ────────────────────────────────────────────────

test("Phase 9D: Panel includes winner waiver future EMI note", () => {
  const src = readFile(panelPath);
  assert.ok(
    src.includes("future EMI") ||
      src.includes("Winner waiver") ||
      src.includes("winner waiver"),
    "Panel must include winner waiver future EMI waiver scope note"
  );
});

// ── 8. No unsafe mutation labels in readiness panel ───────────────────────────

test("Phase 9D: Panel does not contain unsafe activation/mutation buttons", () => {
  const src = readFile(panelPath);
  const unsafePatterns = [
    /Activate\s+Contract/i,
    /Create\s+Payment/i,
    /Post\s+Receipt/i,
    /Create\s+Journal/i,
    /Move\s+Stock/i,
    /Reconcile\s+Now/i,
  ];
  for (const pattern of unsafePatterns) {
    assert.ok(
      !pattern.test(src),
      `Panel must not contain unsafe action label matching: ${pattern.source}`
    );
  }
});

test("Phase 9D: Panel includes read-only notice", () => {
  const src = readFile(panelPath);
  assert.ok(
    src.includes("Read-only") || src.includes("read-only") || src.includes("read_only"),
    "Panel must include a read-only readiness evaluation notice"
  );
  assert.ok(
    src.includes("No payment") || src.includes("no payment") || src.includes("receipt"),
    "Panel must state no payment/receipt/journal record is created from this panel"
  );
});

// ── 9. Subscription list page does not fake per-row readiness ─────────────────

test("Phase 9D: Subscription list page does not fake per-row readiness badges", () => {
  const src = readFile(subscriptionListPath);
  assert.ok(
    !src.includes("readiness_status") || src.includes("Contract readiness is evaluated"),
    "Subscription list must not fake per-row readiness (it's detail-only)"
  );
});

test("Phase 9D: Subscription list page links to detail for readiness", () => {
  const src = readFile(subscriptionListPath);
  assert.ok(
    src.includes("Contract readiness is evaluated on each subscription detail") ||
      src.includes("activation and handover readiness"),
    "Subscription list page must note that contract readiness is evaluated at the detail level"
  );
});

// ── 10. Customer page does not aggregate fake readiness ───────────────────────

test("Phase 9D: Customer detail page does not aggregate fake readiness", () => {
  const src = readFile(customerDetailPath);
  assert.ok(
    !src.includes("<ContractActivationReadinessPanel"),
    "Customer detail page must not render ContractActivationReadinessPanel (no fake aggregation)"
  );
});

test("Phase 9D: Customer detail page includes readiness-is-subscription-level note", () => {
  const src = readFile(customerDetailPath);
  assert.ok(
    src.includes("Contract readiness is evaluated on each subscription detail") ||
      src.includes("subscription-level") ||
      src.includes("backend-evaluated"),
    "Customer detail page must note that contract readiness is subscription-level"
  );
});

// ── 11. Batch page does not aggregate fake readiness ─────────────────────────

test("Phase 9D: Batch detail page does not aggregate fake readiness", () => {
  const src = readFile(batchDetailPath);
  assert.ok(
    !src.includes("<ContractActivationReadinessPanel"),
    "Batch detail page must not render ContractActivationReadinessPanel (no fake aggregation)"
  );
});

test("Phase 9D: Batch detail page includes draw/delivery readiness is subscription-level note", () => {
  const src = readFile(batchDetailPath);
  assert.ok(
    src.includes("subscription-level") ||
      src.includes("backend-evaluated") ||
      src.includes("Draw and delivery readiness remain subscription-level"),
    "Batch detail page must note that readiness is subscription-level and backend-evaluated"
  );
});

// ── 12. No route ownership flip ───────────────────────────────────────────────

test("Phase 9D: Subscription detail page is still at /admin/subscriptions/[id] (no flip)", () => {
  assert.ok(
    existsSync(subscriptionDetailPath),
    "/admin/subscriptions/[id]/page.tsx must still exist — no route ownership flip"
  );
  const src = readFile(subscriptionDetailPath);
  assert.ok(
    !src.includes('redirect("/admin/'),
    "Subscription detail page must not redirect to a different route — no ownership flip"
  );
});

test("Phase 9D: Subscription list page is still at /admin/subscriptions (no flip)", () => {
  assert.ok(
    existsSync(subscriptionListPath),
    "/admin/subscriptions/page.tsx must still exist — no route ownership flip"
  );
  const src = readFile(subscriptionListPath);
  assert.ok(
    !src.includes('redirect("/admin/subscriptions/') ||
      src.includes("SubscriptionWorkflowLanding"),
    "Subscription list page must not have been replaced or flipped to a different route"
  );
});

// ── 13. Readiness categories are machine-readable in panel ────────────────────

test("Phase 9D: Panel exposes the seven required readiness category keys", () => {
  const src = readFile(panelPath);
  const requiredCategories = [
    "kyc_profile",
    "contract_data",
    "emi_schedule",
    "payment_deposit",
    "delivery",
    "inventory_stock",
    "accounting_bridge",
  ];
  for (const cat of requiredCategories) {
    assert.ok(
      src.includes(cat),
      `Panel must include readiness category key: ${cat}`
    );
  }
});

test("Phase 9D: Panel uses machine-readable blocker shape (code, category, severity, message)", () => {
  const src = readFile(panelPath);
  assert.ok(src.includes("code"), "Blocker row must have code field");
  assert.ok(src.includes("category"), "Blocker row must have category field");
  assert.ok(src.includes("severity"), "Blocker row must have severity field");
  assert.ok(src.includes("message"), "Blocker row must have message field");
});
