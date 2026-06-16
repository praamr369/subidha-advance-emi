/**
 * KYC contract gating — frontend static-assertion tests.
 *
 * Asserts that:
 * 1. KycReadinessPanel is present in the subscription create page
 * 2. The activate button is gated on `canActivate` (which requires KYC readiness)
 * 3. Save as Draft is always allowed (gated on `canSaveAsDraft`, not KYC)
 * 4. Direct sale is shown as KYC optional, not blocked
 * 5. Missing documents do not show a fake verified state
 * 6. The KYC readiness service types are correctly exported
 * 7. The `save_as_draft` flag is threaded through rent/lease API calls
 *
 * All assertions run under raw node --test (no bundler needed).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();

const createPageSource = readFileSync(
  join(
    rootDir,
    "src/domains/subscriptions/pages/SubscriptionCreatePage.tsx"
  ),
  "utf8"
);

const panelSource = readFileSync(
  join(
    rootDir,
    "src/domains/subscriptions/components/KycReadinessPanel.tsx"
  ),
  "utf8"
);

const kycServiceSource = readFileSync(
  join(rootDir, "src/services/kyc-readiness.ts"),
  "utf8"
);

// ---------------------------------------------------------------------------
// 1. Component presence
// ---------------------------------------------------------------------------

test("KycReadinessPanel component file exists", () => {
  assert.ok(
    existsSync(
      join(
        rootDir,
        "src/domains/subscriptions/components/KycReadinessPanel.tsx"
      )
    ),
    "KycReadinessPanel.tsx must exist in the subscriptions components directory"
  );
});

test("SubscriptionCreatePage imports KycReadinessPanel", () => {
  assert.ok(
    createPageSource.includes("KycReadinessPanel"),
    "SubscriptionCreatePage must import and render KycReadinessPanel"
  );
});

test("SubscriptionCreatePage renders KycReadinessPanel for rent/lease/emi", () => {
  assert.ok(
    createPageSource.includes("<KycReadinessPanel"),
    "SubscriptionCreatePage JSX must include <KycReadinessPanel"
  );
  assert.ok(
    createPageSource.includes("isRentPlan || isLeasePlan || isEmiPlan"),
    "KYC readiness panel must be shown for RENT, LEASE, and EMI plan types"
  );
});

// ---------------------------------------------------------------------------
// 2. Activate button gating
// ---------------------------------------------------------------------------

test("activate-contract button is gated on canActivate, not canSubmit", () => {
  assert.ok(
    createPageSource.includes("data-testid=\"activate-contract-button\""),
    "Activate Contract button must have data-testid for identification"
  );
  // The activate button must use canActivate (which incorporates KYC readiness)
  assert.ok(
    createPageSource.includes("!canActivate || submitting"),
    "Activate Contract button disabled condition must reference canActivate"
  );
});

test("canActivate gates rent/lease on KYC readiness from the backend", () => {
  assert.ok(
    createPageSource.includes("kycReadiness && !kycReadiness.can_activate"),
    "canActivate must be false when readiness is loaded and can_activate is false"
  );
});

test("canActivate passes through for EMI (gate is at activation step, not creation)", () => {
  assert.ok(
    createPageSource.includes("if (isEmiPlan) return canSubmit"),
    "EMI plan type must not be gated on KYC readiness at subscription creation"
  );
});

// ---------------------------------------------------------------------------
// 3. Save as Draft is always allowed
// ---------------------------------------------------------------------------

test("Save as Draft button exists and is not KYC-gated", () => {
  assert.ok(
    createPageSource.includes("data-testid=\"save-draft-button\""),
    "Save as Draft button must have data-testid for identification"
  );
  assert.ok(
    createPageSource.includes("!canSaveAsDraft || submitting"),
    "Save as Draft disabled condition must reference canSaveAsDraft (no KYC check)"
  );
  // canSaveAsDraft must NOT reference kycReadiness
  const canSaveDraftSection = createPageSource.slice(
    createPageSource.indexOf("const canSaveAsDraft"),
    createPageSource.indexOf("const canSaveAsDraft") + 500
  );
  assert.ok(
    !canSaveDraftSection.includes("kycReadiness"),
    "canSaveAsDraft must not reference kycReadiness — draft saves bypass the KYC gate"
  );
});

test("Save as Draft passes save_as_draft: true to the API", () => {
  assert.ok(
    createPageSource.includes("saveAsDraft: true"),
    "handleSubmit must be called with saveAsDraft: true from the Save as Draft button"
  );
  assert.ok(
    createPageSource.includes("save_as_draft: asDraft"),
    "rent/lease API body must include save_as_draft field"
  );
});

// ---------------------------------------------------------------------------
// 4. Direct sale is KYC optional
// ---------------------------------------------------------------------------

test("KycReadinessPanel shows direct sale as KYC optional", () => {
  assert.ok(
    panelSource.includes("is_direct_sale"),
    "KycReadinessPanel must check is_direct_sale flag from the readiness response"
  );
  assert.ok(
    panelSource.includes("KYC optional for direct sale"),
    "KycReadinessPanel must label direct sale as KYC optional, not blocked"
  );
});

// ---------------------------------------------------------------------------
// 5. Missing docs do not show fake verified state
// ---------------------------------------------------------------------------

test("KycReadinessPanel shows MISSING for absent documents, not VERIFIED", () => {
  // The panel must not render a present/verified label when doc.present is false
  assert.ok(
    panelSource.includes("doc.present ? (doc.status || \"PRESENT\") : \"MISSING\""),
    "Panel must show MISSING when a document is absent, never a verified-looking label"
  );
});

test("KycReadinessPanel shows separate status for PENDING documents", () => {
  assert.ok(
    panelSource.includes("\"PENDING\""),
    "Panel must distinguish PENDING uploads from verified documents"
  );
});

// ---------------------------------------------------------------------------
// 6. KYC readiness service types are exported
// ---------------------------------------------------------------------------

test("kyc-readiness service exports ContractKycReadiness type", () => {
  assert.ok(
    kycServiceSource.includes("export type ContractKycReadiness"),
    "kyc-readiness.ts must export ContractKycReadiness type"
  );
});

test("kyc-readiness service exports fetchContractKycReadiness function", () => {
  assert.ok(
    kycServiceSource.includes("export async function fetchContractKycReadiness"),
    "kyc-readiness.ts must export the fetchContractKycReadiness async function"
  );
});

test("kyc-readiness service includes all required readiness fields", () => {
  assert.ok(kycServiceSource.includes("can_activate"), "readiness type must include can_activate");
  assert.ok(kycServiceSource.includes("can_generate_final_contract"), "readiness type must include can_generate_final_contract");
  assert.ok(kycServiceSource.includes("can_deliver"), "readiness type must include can_deliver");
  assert.ok(kycServiceSource.includes("missing_documents"), "readiness type must include missing_documents");
  assert.ok(kycServiceSource.includes("blocker_codes"), "readiness type must include blocker_codes");
  assert.ok(kycServiceSource.includes("blocker_messages"), "readiness type must include blocker_messages");
  assert.ok(kycServiceSource.includes("exception_approved"), "readiness type must include exception_approved");
});

// ---------------------------------------------------------------------------
// 7. API integration correctness
// ---------------------------------------------------------------------------

test("kyc-readiness service calls the correct backend endpoint", () => {
  assert.ok(
    kycServiceSource.includes("/admin/customers/"),
    "fetchContractKycReadiness must call /admin/customers/<id>/contract-readiness/"
  );
  assert.ok(
    kycServiceSource.includes("contract-readiness"),
    "fetchContractKycReadiness must target the contract-readiness endpoint"
  );
  assert.ok(
    kycServiceSource.includes("plan_type"),
    "fetchContractKycReadiness must pass plan_type as a query parameter"
  );
});

test("KycReadinessPanel uses onReadinessChange callback to lift state", () => {
  assert.ok(
    panelSource.includes("onReadinessChange"),
    "KycReadinessPanel must accept and call onReadinessChange to lift readiness state"
  );
  assert.ok(
    createPageSource.includes("onReadinessChange={setKycReadiness}"),
    "SubscriptionCreatePage must wire onReadinessChange to setKycReadiness state setter"
  );
});
