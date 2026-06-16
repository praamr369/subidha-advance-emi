/**
 * Phase 9B-NF — No-Flip Operational UI Improvement guard tests.
 *
 * These tests lock the safety boundaries introduced in Phases 9B-NF2 through
 * 9B-NF6. They assert:
 *   - No-flip route policy is documented.
 *   - Canonical aliases still redirect to legacy content-owner routes (no flip).
 *   - Each touched page carries the correct module header copy.
 *   - Customer page does not imply payment/accounting posting.
 *   - Outstandings page separates amount-due from collection/accounting.
 *   - Batch page does not fake draw readiness or winner state.
 *   - Subscription page preserves plan-type boundaries.
 *   - Inventory page does not link stock source workflow to billing/payment creation.
 *
 * All assertions are file-content / file-existence based (no module imports),
 * compatible with raw `node --test frontend/tests/unit/*.test.ts`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const appRoot = join(thisFileDir, "../../src/app/(dashboard)/admin");
const docsRoot = join(thisFileDir, "../../../docs/architecture");
const pagePath = (rel: string) => join(appRoot, rel, "page.tsx");
const readPage = (rel: string) => readFileSync(pagePath(rel), "utf8");

// ── 1. No-flip policy document exists ──────────────────────────────────────────

test("Phase 9B-NF: admin-no-flip-route-policy.md exists and states all five policy rules", () => {
  const policyPath = join(docsRoot, "admin-no-flip-route-policy.md");
  assert.ok(existsSync(policyPath), "admin-no-flip-route-policy.md must exist");

  const src = readFileSync(policyPath, "utf8");
  assert.ok(
    src.includes("content-owner routes stay stable") || src.includes("Existing content-owner"),
    "Policy must state that existing content-owner routes stay stable"
  );
  assert.ok(
    src.includes("aliases for navigation clarity") || src.includes("Canonical module routes are aliases"),
    "Policy must state canonical routes are aliases for navigation clarity"
  );
  assert.ok(
    src.includes("No route ownership flip without explicit approval") || src.includes("No route ownership flip"),
    "Policy must state no route ownership flip without explicit approval"
  );
  assert.ok(
    src.includes("UI consistency") || src.includes("operational clarity") || src.includes("fake UI removal"),
    "Policy must state cleanup focuses on UI consistency and operational clarity"
  );
  assert.ok(
    src.includes("Deletion is postponed") || src.includes("postponed until"),
    "Policy must state deletion is postponed until a future approved release"
  );
});

// ── 2. No-flip: canonical alias routes still redirect to legacy content owners ──

test("Phase 9B-NF: profile canonical routes still redirect to legacy content (no flip)", () => {
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
    assert.ok(
      src.includes(`redirect("${target}")`),
      `/admin/${rel} must still redirect to ${target} — no flip permitted`
    );
  }
});

test("Phase 9B-NF: lucky-plan and finance canonical routes still redirect to legacy content (no flip)", () => {
  const aliasTargets: Record<string, string> = {
    "lucky-plan/batches": "/admin/batches",
    "lucky-plan/lucky-ids": "/admin/lucky-ids",
    "lucky-plan/draws": "/admin/lucky-draws",
    "finance/outstandings": "/admin/outstandings",
    "finance/customer-advances": "/admin/customer-advances",
    "requests/online-enquiries": "/admin/online-enquiries",
    "requests/support": "/admin/support-requests",
    "requests/subscriptions": "/admin/subscription-requests",
  };
  for (const [rel, target] of Object.entries(aliasTargets)) {
    const src = readPage(rel);
    assert.ok(
      src.includes(`redirect("${target}")`),
      `/admin/${rel} must still redirect to ${target} — no flip permitted`
    );
  }
});

// ── 3. Phase 9B-NF2: Customer page — profile source, no payment/accounting implied

test("Phase 9B-NF2: customers page carries 'Profiles & Parties' module eyebrow", () => {
  const src = readPage("customers");
  assert.ok(
    src.includes("Profiles & Parties"),
    "customers page must carry 'Profiles & Parties' eyebrow"
  );
});

test("Phase 9B-NF2: customers page carries 'Customer profile source' or 'Customer Profile Source' label", () => {
  const src = readPage("customers");
  assert.ok(
    src.includes("Customer profile source") || src.includes("Customer Profile Source"),
    "customers page must include customer profile source language"
  );
});

test("Phase 9B-NF2: customers page names Finance Operations, Collections & Cashier, and Accounting & Reconciliation as separate modules", () => {
  const src = readPage("customers");
  assert.ok(
    src.includes("Finance Operations"),
    "customers page must name Finance Operations as the money posture module"
  );
  assert.ok(
    src.includes("Collections & Cashier"),
    "customers page must name Collections & Cashier as the collection module"
  );
  assert.ok(
    src.includes("Accounting & Reconciliation"),
    "customers page must name Accounting & Reconciliation as the bridge module"
  );
});

test("Phase 9B-NF2: customers page does not imply payment posting or journal creation from the profile page", () => {
  const src = readPage("customers");
  // Acceptable: navigating to collection page. Unacceptable: "Post payment", "Create journal", "Post receipt"
  assert.ok(
    !src.includes("Post payment") && !src.includes("Post receipt") && !src.includes("Create journal"),
    "customers page must not imply payment posting or journal creation"
  );
});

// ── 4. Phase 9B-NF3: Outstandings page — amount due, not collection/reconciliation

test("Phase 9B-NF3: outstandings page carries 'Finance Operations' module eyebrow", () => {
  const src = readPage("outstandings");
  assert.ok(
    src.includes("Finance Operations"),
    "outstandings page must carry Finance Operations module label"
  );
});

test("Phase 9B-NF3: outstandings page carries 'Finance source workflow' command header", () => {
  const src = readPage("outstandings");
  assert.ok(
    src.includes("Finance source workflow") || src.includes("Finance Operations Source"),
    "outstandings page must include finance source workflow language"
  );
});

test("Phase 9B-NF3: outstandings page names Collections & Cashier and Accounting & Reconciliation as separate modules", () => {
  const src = readPage("outstandings");
  assert.ok(
    src.includes("Collections & Cashier"),
    "outstandings page must name Collections & Cashier for collection action"
  );
  assert.ok(
    src.includes("Accounting & Reconciliation"),
    "outstandings page must name Accounting & Reconciliation for bridge/reconciliation"
  );
});

test("Phase 9B-NF3: outstandings page does not imply collection or reconciliation happens from page load", () => {
  const src = readPage("outstandings");
  assert.ok(
    !src.includes("Auto-reconcile") && !src.includes("auto-post") && !src.includes("Auto collect"),
    "outstandings page must not imply automatic collection or reconciliation"
  );
});

test("Phase 9B-NF3: outstandings collection button links to real collection page only", () => {
  const src = readPage("outstandings");
  // The collection action must use payment_url from backend or link to collection workspace
  assert.ok(
    src.includes("payment_url") || src.includes("Collection Workspace") || src.includes("financeCollect"),
    "outstandings collection button must link to real collection page from backend state or collection workspace"
  );
});

// ── 5. Phase 9B-NF4: Batch page — Lucky Plan Control, no fake state

test("Phase 9B-NF4: batches page carries 'Lucky Plan Control' module eyebrow", () => {
  const src = readPage("batches");
  assert.ok(
    src.includes("Lucky Plan Control"),
    "batches page must carry 'Lucky Plan Control' eyebrow or statusBadge"
  );
});

test("Phase 9B-NF4: batches page carries 'Batch source' or 'Batch Source' label", () => {
  const src = readPage("batches");
  assert.ok(
    src.includes("Batch source") || src.includes("Batch Source"),
    "batches page must include batch source language"
  );
});

test("Phase 9B-NF4: batches page links to Lucky IDs and Lucky Draws", () => {
  const src = readPage("batches");
  assert.ok(
    src.includes("/admin/lucky-ids"),
    "batches page must link to /admin/lucky-ids"
  );
  assert.ok(
    src.includes("/admin/lucky-draws"),
    "batches page must link to /admin/lucky-draws"
  );
});

test("Phase 9B-NF4: batches page links to subscriptions filtered by batch", () => {
  const src = readPage("batches");
  assert.ok(
    src.includes("plan_type=EMI") || src.includes("batch=${row.id}"),
    "batches page must link to subscriptions filtered by plan type or batch"
  );
});

test("Phase 9B-NF4: batches page states winner waiver is future EMI only", () => {
  const src = readPage("batches");
  assert.ok(
    src.includes("future EMI") || src.includes("future instalments") || src.includes("future EMI instalment"),
    "batches page must state winner waiver applies to future EMI only"
  );
});

test("Phase 9B-NF4: batches page does not contain fake draw readiness claim or fake paid-first-EMI status copy", () => {
  const src = readPage("batches");
  // "Draw readiness" is a legitimate term for explaining the concept; the guard is
  // against hardcoded fake claims such as "Draw ready: Yes" or "Paid first EMI: Yes".
  assert.ok(
    !src.includes("Draw ready: Yes") && !src.includes("Paid first EMI: Yes"),
    "batches page must not contain hardcoded fake draw-ready or paid-first-EMI claims"
  );
  // "No fake draw readiness" is acceptable as explanatory/warning copy on the page.
  // The guard is specifically against presenting a hardcoded fake claim to the user.
  assert.ok(
    !src.includes(">Draw ready<") && !src.includes("draw is ready"),
    "batches page must not present draw-ready as a hardcoded positive claim"
  );
});

// ── 6. Phase 9B-NF5: Subscriptions page — plan-type boundaries clear

test("Phase 9B-NF5: subscriptions page carries 'Sales & Contracts' module eyebrow", () => {
  const src = readPage("subscriptions");
  assert.ok(
    src.includes("Sales & Contracts"),
    "subscriptions page must carry 'Sales & Contracts' module label"
  );
});

test("Phase 9B-NF5: subscriptions page carries 'Contract source workflow' language", () => {
  const src = readPage("subscriptions");
  assert.ok(
    src.includes("Contract source workflow") || src.includes("Contract Source Workflow"),
    "subscriptions page must include contract source workflow language"
  );
});

test("Phase 9B-NF5: subscriptions page separates Advance EMI Lucky Plan context from Rent/Lease", () => {
  const src = readPage("subscriptions");
  assert.ok(
    src.includes("Lucky ID") && src.includes("Lucky Plan"),
    "subscriptions page must mention Lucky ID and Lucky Plan context"
  );
  assert.ok(
    src.includes("Rent") && src.includes("Lease"),
    "subscriptions page must mention Rent and Lease plan types"
  );
  assert.ok(
    src.includes("No Lucky ID") || src.includes("no draw") || src.includes("No Lucky Draw"),
    "subscriptions page must state Rent/Lease have no Lucky ID or draw context"
  );
});

test("Phase 9B-NF5: subscriptions page states winner waiver is future EMI only", () => {
  const src = readPage("subscriptions");
  assert.ok(
    src.includes("future EMI") || src.includes("future instalments"),
    "subscriptions page must state winner waiver applies to future EMI only"
  );
});

test("Phase 9B-NF5: subscriptions page names Collections & Cashier for payment/receipt", () => {
  const src = readPage("subscriptions");
  assert.ok(
    src.includes("Collections & Cashier"),
    "subscriptions page must name Collections & Cashier for payment and receipt"
  );
});

test("Phase 9B-NF5: subscriptions page names Accounting & Reconciliation for bridge/reconciliation", () => {
  const src = readPage("subscriptions");
  assert.ok(
    src.includes("Accounting & Reconciliation"),
    "subscriptions page must name Accounting & Reconciliation"
  );
});

test("Phase 9B-NF5: subscriptions page names Delivery & Service for delivery/handover", () => {
  const src = readPage("subscriptions");
  assert.ok(
    src.includes("Delivery & Service"),
    "subscriptions page must name Delivery & Service for delivery and handover"
  );
});

// ── 7. Phase 9B-NF6: Inventory page — stock source workflow, no billing/payment creation

test("Phase 9B-NF6: inventory page carries 'Inventory & Stock' module eyebrow", () => {
  const src = readPage("inventory");
  assert.ok(
    src.includes("Inventory & Stock"),
    "inventory page must carry 'Inventory & Stock' module label"
  );
});

test("Phase 9B-NF6: inventory page carries 'Stock source workflow' language", () => {
  const src = readPage("inventory");
  assert.ok(
    src.includes("Stock source workflow") || src.includes("stock source workflow"),
    "inventory page must include stock source workflow language"
  );
});

test("Phase 9B-NF6: inventory page separates stock on hand, available, reserved, and delivery out", () => {
  const src = readPage("inventory");
  assert.ok(src.includes("on_hand_qty") || src.includes("On hand") || src.includes("On Hand"), "inventory page must show on-hand stock");
  assert.ok(src.includes("available_qty") || src.includes("Available"), "inventory page must show available stock");
  assert.ok(src.includes("reserved_qty") || src.includes("Reserved"), "inventory page must show reserved stock");
  assert.ok(src.includes("Delivery out") || src.includes("EMI_DELIVERY_OUT"), "inventory page must show delivery-out context");
});

test("Phase 9B-NF6: inventory page names Purchases & Vendors for purchase receipt / supply chain", () => {
  const src = readPage("inventory");
  assert.ok(
    src.includes("Purchases & Vendors") || src.includes("purchases"),
    "inventory page must link or name Purchases & Vendors for purchase receipt"
  );
});

test("Phase 9B-NF6: inventory page names Accounting & Reconciliation for bridge posting", () => {
  const src = readPage("inventory");
  assert.ok(
    src.includes("Accounting & Reconciliation") || src.includes("accounting bridge"),
    "inventory page must name Accounting & Reconciliation for COGS/bridge posting"
  );
});

test("Phase 9B-NF6: inventory page does not link stock source to billing or payment creation", () => {
  const src = readPage("inventory");
  assert.ok(
    !src.includes("Create vendor payment") && !src.includes("Post purchase bill"),
    "inventory page must not link stock to billing or payment creation"
  );
});
