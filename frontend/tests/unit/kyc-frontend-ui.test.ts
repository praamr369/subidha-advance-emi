import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();

function read(rel: string): string {
  return readFileSync(join(rootDir, rel), "utf8");
}

const panelSource = read("src/components/kyc/KycDocumentPanel.tsx");
const adminCustomerSource = read("src/app/(dashboard)/admin/customers/[id]/page.tsx");
const adminPartnerSource = read("src/app/(dashboard)/admin/partners/[id]/page.tsx");
const adminVendorSource = read("src/app/(dashboard)/admin/vendors/[id]/page.tsx");
const adminStaffSource = read("src/app/(dashboard)/admin/hr/staff/[id]/page.tsx");
const partnerSelfSource = read("src/app/(dashboard)/partner/page.tsx");
const vendorSelfSource = read("src/app/(dashboard)/vendor/profile/page.tsx");
const staffSelfSource = read("src/app/(dashboard)/staff/profile/page.tsx");
const customerSelfSource = read("src/app/(dashboard)/customer/profile/page.tsx");
const kycServiceSource = read("src/services/kyc.ts");
const reviewQueueSource = read("src/app/(dashboard)/admin/crm/kyc/page.tsx");
const partyKycPanelSource = read("src/components/kyc/PartyKycPanel.tsx");
const partyDetailSource = read("src/app/(dashboard)/admin/crm/parties/[id]/page.tsx");

// --- The panel only consumes the real unified KYC service ---------------------

test("KycDocumentPanel imports only from the unified @/services/kyc client", () => {
  assert.ok(panelSource.includes('from "@/services/kyc"'));
  // No fabricated status source: it relies on backend status helpers.
  assert.ok(panelSource.includes("kycStatusLabel"));
  assert.ok(panelSource.includes("kycStatusTone"));
});

test("KycDocumentPanel wires every real admin endpoint helper", () => {
  for (const fn of [
    "listAdminKycDocuments",
    "uploadAdminKycDocument",
    "approveAdminKycDocument",
    "rejectAdminKycDocument",
    "requestAdminKycResubmission",
    "getAdminKycAuditTrail",
    "buildAdminKycDownloadPath",
  ]) {
    assert.ok(panelSource.includes(fn), `expected panel to use ${fn}`);
  }
});

test("KycDocumentPanel wires the real partner/vendor/staff self endpoints", () => {
  for (const fn of [
    "listPartnerSelfKycDocuments",
    "uploadPartnerSelfKycDocument",
    "getPartnerSelfKycAuditTrail",
    "listVendorSelfKycDocuments",
    "uploadVendorSelfKycDocument",
    "getVendorSelfKycAuditTrail",
    "listStaffSelfKycDocuments",
    "uploadStaffSelfKycDocument",
    "getStaffSelfKycAuditTrail",
  ]) {
    assert.ok(panelSource.includes(fn), `expected panel to use ${fn}`);
  }
});

// --- Admin panel renders for customer / partner / vendor / staff -------------

test("admin customer detail renders the admin KYC panel", () => {
  assert.ok(adminCustomerSource.includes('import KycDocumentPanel from "@/components/kyc/KycDocumentPanel"'));
  assert.ok(adminCustomerSource.includes('<KycDocumentPanel mode="admin" owner="customer"'));
});

test("admin customer page renders a single KYC document panel (no duplicate inline review)", () => {
  // The unified panel is the sole KYC document surface — exactly one instance.
  const panelInstances = adminCustomerSource.match(/<KycDocumentPanel\b/g) ?? [];
  assert.equal(
    panelInstances.length,
    1,
    "expected exactly one <KycDocumentPanel> on the admin customer page"
  );
  // The legacy inline per-document review UI and its helpers must be gone, so the
  // /admin/customers/{id}/kyc-documents endpoints are driven only by the panel.
  assert.ok(!adminCustomerSource.includes("Submitted KYC documents"));
  assert.ok(!adminCustomerSource.includes("handleKycDocumentReview"));
  assert.ok(!adminCustomerSource.includes("listAdminCustomerKycDocuments"));
  assert.ok(!adminCustomerSource.includes("approveAdminCustomerKycDocument"));
  assert.ok(!adminCustomerSource.includes("rejectAdminCustomerKycDocument"));
});

test("admin partner detail renders the admin KYC panel", () => {
  assert.ok(adminPartnerSource.includes('import KycDocumentPanel from "@/components/kyc/KycDocumentPanel"'));
  assert.ok(adminPartnerSource.includes('<KycDocumentPanel mode="admin" owner="partner"'));
});

test("admin vendor detail renders the admin KYC panel", () => {
  assert.ok(adminVendorSource.includes('import KycDocumentPanel from "@/components/kyc/KycDocumentPanel"'));
  assert.ok(adminVendorSource.includes('<KycDocumentPanel mode="admin" owner="vendor"'));
});

test("admin staff detail exposes a KYC tab rendering the admin KYC panel", () => {
  assert.ok(adminStaffSource.includes('import KycDocumentPanel from "@/components/kyc/KycDocumentPanel"'));
  assert.ok(adminStaffSource.includes('"KYC"'));
  assert.ok(adminStaffSource.includes('activeTab === "KYC" ? <KycDocumentPanel mode="admin" owner="staff"'));
});

// --- Self-service upload panel renders for the supported portals -------------

test("partner portal renders the self KYC panel", () => {
  assert.ok(partnerSelfSource.includes('<KycDocumentPanel mode="self" portal="partner"'));
});

test("vendor portal renders the self KYC panel", () => {
  assert.ok(vendorSelfSource.includes('<KycDocumentPanel mode="self" portal="vendor"'));
});

test("staff portal renders the self KYC panel", () => {
  assert.ok(staffSelfSource.includes('<KycDocumentPanel mode="self" portal="staff"'));
});

test("customer self-service KYC upload already exists on the customer profile", () => {
  // Customer self-service is served by the existing customer service client.
  assert.ok(customerSelfSource.includes("submitCustomerKycDocument"));
  assert.ok(customerSelfSource.includes("Submit KYC document"));
});

// --- Reject requires a reason ------------------------------------------------

test("admin reject requires a non-empty reason before the request fires", () => {
  // Confirm button is disabled without a trimmed reason.
  assert.ok(panelSource.includes("disabled={actionBusy || !actionReason.trim()}"));
  // And the handler guards again before calling the service.
  assert.ok(panelSource.includes("if (!reason) {"));
  assert.ok(panelSource.includes('setActionError("A reason is required.");'));
  assert.ok(panelSource.includes("rejectAdminKycDocument(props.owner, props.ownerId, actionDocId, reason)"));
});

test("admin resubmission request also requires a reason", () => {
  assert.ok(panelSource.includes("requestAdminKycResubmission(props.owner, props.ownerId, actionDocId, reason)"));
});

// --- Non-admin cannot see approve / reject ----------------------------------

test("approve / reject / resubmission controls are gated behind admin mode only", () => {
  // The review buttons live exclusively inside a `props.mode === "admin"` branch.
  assert.ok(panelSource.includes('props.mode === "admin" ? ('));
  // The reasoned-action handlers bail out when not in admin mode.
  assert.ok(panelSource.includes('if (props.mode !== "admin") return;'));
  assert.ok(panelSource.includes('if (props.mode !== "admin" || actionDocId == null || actionKind == null) return;'));
  // Self mode never wires the approve/reject service calls into JSX buttons.
  const selfBranch = panelSource.split('props.mode === "admin" ? (')[1] ?? "";
  assert.ok(selfBranch.includes('Resubmit')); // self only gets Resubmit
});

// --- No fake "Verified" state -------------------------------------------------

test("panel never fabricates a Verified/Approved state", () => {
  // Status text is rendered only via the backend-driven kycStatusLabel helper —
  // never a hardcoded "Verified"/"Approved" literal forced into the badge.
  assert.ok(panelSource.includes("kycStatusLabel(status)"));
  assert.ok(!panelSource.includes('>Verified<'));
  assert.ok(!panelSource.includes('>Approved<'));
  assert.ok(!panelSource.includes('status="VERIFIED"'));
  assert.ok(!panelSource.includes('kycStatusLabel("VERIFIED")'));
  // Empty document state shows Missing, not a fabricated verified badge.
  assert.ok(panelSource.includes(">Missing<"));
  // Rejection reason is surfaced from the backend record.
  assert.ok(panelSource.includes("doc.rejection_reason"));
});

test("panel enforces backend file type/size limits client-side", () => {
  assert.ok(panelSource.includes('"image/jpeg", "image/png", "application/pdf"'));
  assert.ok(panelSource.includes("5 * 1024 * 1024"));
  assert.ok(panelSource.includes("File must be 5 MB or smaller."));
});

// --- CRM-wide KYC review queue service ---------------------------------------

test("kyc service exposes the cross-owner review queue + party KYC clients", () => {
  for (const fn of [
    "listKycReviewQueue",
    "approveKycQueueDocument",
    "rejectKycQueueDocument",
    "requestKycQueueResubmission",
    "getPartyKyc",
  ]) {
    assert.ok(kycServiceSource.includes(`export async function ${fn}`), `expected kyc service to export ${fn}`);
  }
  // Review-queue + party endpoints hit the real additive admin routes.
  assert.ok(kycServiceSource.includes("/admin/kyc/review-queue/"));
  assert.ok(kycServiceSource.includes("/admin/crm/parties/"));
  // Owner type from the backend (UPPER) is normalised to the lowercase client union.
  assert.ok(kycServiceSource.includes(".toLowerCase() as KycOwnerType"));
});

// --- Admin KYC review queue page --------------------------------------------

test("admin KYC review queue page renders the real queue (no redirect, no fake data)", () => {
  // The page is now a real client page, not a redirect stub.
  assert.ok(reviewQueueSource.includes('"use client"'));
  assert.ok(!reviewQueueSource.includes("redirectToCanonicalPath"));
  // It consumes the real queue + action service helpers.
  for (const fn of [
    "listKycReviewQueue",
    "approveKycQueueDocument",
    "rejectKycQueueDocument",
    "requestKycQueueResubmission",
  ]) {
    assert.ok(reviewQueueSource.includes(fn), `expected review queue to use ${fn}`);
  }
  // Loading / error / empty states exist; empty state never fabricates verified rows.
  assert.ok(reviewQueueSource.includes("LoadingBlock"));
  assert.ok(reviewQueueSource.includes("ErrorState"));
  assert.ok(reviewQueueSource.includes("EmptyState"));
  assert.ok(reviewQueueSource.includes("No KYC documents awaiting review"));
  assert.ok(!reviewQueueSource.includes(">Verified<"));
});

test("admin KYC review queue wires owner-type / status / search filters", () => {
  assert.ok(reviewQueueSource.includes("Owner type filter"));
  assert.ok(reviewQueueSource.includes("Status filter"));
  assert.ok(reviewQueueSource.includes("Search owner name / phone / email"));
  // Owner badges cover all four canonical owner types.
  for (const owner of ["customer", "partner", "vendor", "staff"]) {
    assert.ok(reviewQueueSource.includes(`${owner}:`), `expected owner badge for ${owner}`);
  }
});

test("admin KYC review queue reject / resubmission require a reason", () => {
  // Confirm button disabled until a trimmed reason is present.
  assert.ok(reviewQueueSource.includes("disabled={actionBusy || !actionReason.trim()}"));
  // Handler guards again before firing the request.
  assert.ok(reviewQueueSource.includes('setActionError("A reason is required.");'));
  assert.ok(reviewQueueSource.includes("rejectKycQueueDocument(row.owner_type, row.document_id, reason)"));
  assert.ok(reviewQueueSource.includes("requestKycQueueResubmission(row.owner_type, row.document_id, reason)"));
});

// --- CRM party KYC panel ----------------------------------------------------

test("CRM party KYC panel shows linked owner KYC or the conversion-required state", () => {
  // Resolves party -> linked owner via the real service.
  assert.ok(partyKycPanelSource.includes("getPartyKyc"));
  // Linked owner reuses the shared admin KycDocumentPanel (existing owner endpoints).
  assert.ok(partyKycPanelSource.includes('import KycDocumentPanel from "@/components/kyc/KycDocumentPanel"'));
  assert.ok(partyKycPanelSource.includes('<KycDocumentPanel'));
  assert.ok(partyKycPanelSource.includes('mode="admin"'));
  // Unconverted party shows the controlled conversion-required message and no upload.
  assert.ok(partyKycPanelSource.includes("kyc_available"));
  assert.ok(
    partyKycPanelSource.includes(
      "KYC is available after this party is converted or linked to a customer, partner, vendor, or staff profile."
    )
  );
});

test("CRM party detail page mounts the party KYC panel", () => {
  assert.ok(partyDetailSource.includes('import PartyKycPanel from "@/components/kyc/PartyKycPanel"'));
  assert.ok(partyDetailSource.includes("<PartyKycPanel partyId={payload.party.id} />"));
});
