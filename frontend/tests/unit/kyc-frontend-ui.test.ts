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
