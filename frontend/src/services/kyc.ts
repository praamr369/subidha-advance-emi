import { apiFetch } from "@/lib/api";

/**
 * Unified KYC intake & review service.
 *
 * Additive client covering the new admin and partner-self KYC endpoints for
 * all owner types (customer, partner, vendor, staff). Existing
 * customer-specific helpers in `@/services/customer` and the contract gating
 * client in `@/services/kyc-readiness` remain unchanged; this module wraps the
 * new generic review/upload/audit endpoints.
 */

export type KycOwnerType = "customer" | "partner" | "vendor" | "staff";

export type KycDocumentRecord = {
  id: number;
  document_type: string;
  category: string;
  status: string;
  original_filename: string;
  file_size: number;
  notes: string;
  upload_source: string;
  uploaded_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string;
  created_at: string | null;
};

export type KycDocumentListResponse = {
  count: number;
  results: KycDocumentRecord[];
};

export type KycReviewActionRecord = {
  id: number;
  action: string;
  old_status: string;
  new_status: string;
  reason: string;
  upload_source: string;
  document_model: string;
  document_id: number | null;
  performed_by: string | null;
  performed_at: string | null;
};

export type KycAuditTrailResponse = {
  owner_type: string;
  owner_id: number;
  results: KycReviewActionRecord[];
};

export type KycUploadPayload = {
  document_type: string;
  file: File;
  category?: string;
  notes?: string;
  document_reference?: string;
};

// ---------------------------------------------------------------------------
// Path builders (owner-type aware). Staff uses /admin/hr/staff/{id}/ base.
// ---------------------------------------------------------------------------

function adminBasePath(owner: KycOwnerType, ownerId: number | string): string {
  switch (owner) {
    case "customer":
      return `/admin/customers/${ownerId}/kyc-documents`;
    case "partner":
      return `/admin/partners/${ownerId}/kyc-documents`;
    case "vendor":
      return `/admin/vendors/${ownerId}/kyc-documents`;
    case "staff":
      return `/admin/hr/staff/${ownerId}/kyc-documents`;
    default:
      throw new Error(`Unknown KYC owner type: ${owner}`);
  }
}

function adminApiBasePath(owner: KycOwnerType, ownerId: number | string): string {
  return `/api/v1${adminBasePath(owner, ownerId)}`;
}

// ---------------------------------------------------------------------------
// Normalisers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function normalizeDocument(raw: unknown): KycDocumentRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: Number(r.id ?? 0),
    document_type: str(r.document_type),
    category: str(r.category),
    status: str(r.status, "SUBMITTED"),
    original_filename: str(r.original_filename),
    file_size: Number(r.file_size ?? 0),
    notes: str(r.notes),
    upload_source: str(r.upload_source),
    uploaded_by: strOrNull(r.uploaded_by),
    reviewed_by: strOrNull(r.reviewed_by),
    reviewed_at: strOrNull(r.reviewed_at),
    rejection_reason: str(r.rejection_reason),
    created_at: strOrNull(r.created_at),
  };
}

function normalizeAction(raw: unknown): KycReviewActionRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: Number(r.id ?? 0),
    action: str(r.action),
    old_status: str(r.old_status),
    new_status: str(r.new_status),
    reason: str(r.reason),
    upload_source: str(r.upload_source),
    document_model: str(r.document_model),
    document_id: r.document_id == null ? null : Number(r.document_id),
    performed_by: strOrNull(r.performed_by),
    performed_at: strOrNull(r.performed_at),
  };
}

// ---------------------------------------------------------------------------
// Admin: list documents (partner/vendor/staff use the generic endpoint;
// customers continue using the existing customer service if desired, but
// this also works for customers).
// ---------------------------------------------------------------------------

export async function listAdminKycDocuments(
  owner: KycOwnerType,
  ownerId: number | string
): Promise<KycDocumentListResponse> {
  const response = await apiFetch<unknown>(`${adminBasePath(owner, ownerId)}/`);
  const root = (response ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results)
    ? (root.results as unknown[]).map(normalizeDocument)
    : [];
  return { count: Number(root.count ?? results.length), results };
}

// ---------------------------------------------------------------------------
// Admin: upload a KYC document for any owner type
// ---------------------------------------------------------------------------

export async function uploadAdminKycDocument(
  owner: KycOwnerType,
  ownerId: number | string,
  payload: KycUploadPayload
): Promise<{ id: number; status: string; document_type: string }> {
  const form = new FormData();
  form.append("document_type", payload.document_type);
  form.append("file", payload.file);
  if (payload.category) form.append("category", payload.category);
  if (payload.notes) form.append("notes", payload.notes);
  if (payload.document_reference)
    form.append("document_reference", payload.document_reference);

  const response = await apiFetch<unknown>(
    `${adminBasePath(owner, ownerId)}/upload/`,
    { method: "POST", body: form }
  );
  const root = (response ?? {}) as Record<string, unknown>;
  return {
    id: Number(root.id ?? 0),
    status: str(root.status, "SUBMITTED"),
    document_type: str(root.document_type),
  };
}

// ---------------------------------------------------------------------------
// Admin: review actions (approve / reject / request resubmission)
// Customers retain their existing approve/reject endpoints; for customers,
// resubmission uses the new request-resubmission endpoint.
// ---------------------------------------------------------------------------

export async function approveAdminKycDocument(
  owner: KycOwnerType,
  ownerId: number | string,
  documentId: number
): Promise<{ id?: number; status?: string; updated?: boolean }> {
  return apiFetch(`${adminBasePath(owner, ownerId)}/${documentId}/approve/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function rejectAdminKycDocument(
  owner: KycOwnerType,
  ownerId: number | string,
  documentId: number,
  reason: string
): Promise<{ id?: number; status?: string; updated?: boolean }> {
  return apiFetch(`${adminBasePath(owner, ownerId)}/${documentId}/reject/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function requestAdminKycResubmission(
  owner: KycOwnerType,
  ownerId: number | string,
  documentId: number,
  reason: string
): Promise<{ id?: number; status?: string }> {
  return apiFetch(
    `${adminBasePath(owner, ownerId)}/${documentId}/request-resubmission/`,
    { method: "POST", body: JSON.stringify({ reason }) }
  );
}

// ---------------------------------------------------------------------------
// Admin: audit trail
// ---------------------------------------------------------------------------

export async function getAdminKycAuditTrail(
  owner: KycOwnerType,
  ownerId: number | string
): Promise<KycAuditTrailResponse> {
  const response = await apiFetch<unknown>(
    `${adminBasePath(owner, ownerId)}/audit-trail/`
  );
  const root = (response ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results)
    ? (root.results as unknown[]).map(normalizeAction)
    : [];
  return {
    owner_type: str(root.owner_type),
    owner_id: Number(root.owner_id ?? 0),
    results,
  };
}

// ---------------------------------------------------------------------------
// Admin: download path (used as href; auth handled by browser session/proxy)
// ---------------------------------------------------------------------------

export function buildAdminKycDownloadPath(
  owner: KycOwnerType,
  ownerId: number | string,
  documentId: number
): string {
  // Customers use the pre-existing customer download endpoint shape.
  return `${adminApiBasePath(owner, ownerId)}/${documentId}/download/`;
}

// ---------------------------------------------------------------------------
// Partner self-service
// ---------------------------------------------------------------------------

export async function listPartnerSelfKycDocuments(): Promise<KycDocumentListResponse> {
  const response = await apiFetch<unknown>("/partner/kyc/documents/");
  const root = (response ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results)
    ? (root.results as unknown[]).map(normalizeDocument)
    : [];
  return { count: Number(root.count ?? results.length), results };
}

export async function uploadPartnerSelfKycDocument(payload: {
  document_type: string;
  file: File;
  category?: string;
  notes?: string;
  resubmission_of?: number;
}): Promise<{ id: number; status: string; document_type: string }> {
  const form = new FormData();
  form.append("document_type", payload.document_type);
  form.append("file", payload.file);
  if (payload.category) form.append("category", payload.category);
  if (payload.notes) form.append("notes", payload.notes);
  if (payload.resubmission_of != null)
    form.append("resubmission_of", String(payload.resubmission_of));

  const response = await apiFetch<unknown>("/partner/kyc/documents/upload/", {
    method: "POST",
    body: form,
  });
  const root = (response ?? {}) as Record<string, unknown>;
  return {
    id: Number(root.id ?? 0),
    status: str(root.status, "SUBMITTED"),
    document_type: str(root.document_type),
  };
}

export async function getPartnerSelfKycAuditTrail(): Promise<KycAuditTrailResponse> {
  const response = await apiFetch<unknown>("/partner/kyc/audit-trail/");
  const root = (response ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results)
    ? (root.results as unknown[]).map(normalizeAction)
    : [];
  return {
    owner_type: str(root.owner_type),
    owner_id: Number(root.owner_id ?? 0),
    results,
  };
}

export function buildPartnerSelfKycDownloadPath(documentId: number): string {
  return `/api/v1/partner/kyc/documents/${documentId}/download/`;
}

// ---------------------------------------------------------------------------
// Vendor & staff self-service (mirror the partner self endpoints; the portal
// resolves the owning Vendor / EmployeeProfile from the logged-in user).
// ---------------------------------------------------------------------------

type SelfUploadPayload = {
  document_type: string;
  file: File;
  category?: string;
  notes?: string;
  resubmission_of?: number;
};

function buildSelfUploadForm(payload: SelfUploadPayload): FormData {
  const form = new FormData();
  form.append("document_type", payload.document_type);
  form.append("file", payload.file);
  if (payload.category) form.append("category", payload.category);
  if (payload.notes) form.append("notes", payload.notes);
  if (payload.resubmission_of != null)
    form.append("resubmission_of", String(payload.resubmission_of));
  return form;
}

async function listSelfKycDocuments(basePath: string): Promise<KycDocumentListResponse> {
  const response = await apiFetch<unknown>(`${basePath}/documents/`);
  const root = (response ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results)
    ? (root.results as unknown[]).map(normalizeDocument)
    : [];
  return { count: Number(root.count ?? results.length), results };
}

async function uploadSelfKycDocument(
  basePath: string,
  payload: SelfUploadPayload
): Promise<{ id: number; status: string; document_type: string }> {
  const response = await apiFetch<unknown>(`${basePath}/documents/upload/`, {
    method: "POST",
    body: buildSelfUploadForm(payload),
  });
  const root = (response ?? {}) as Record<string, unknown>;
  return {
    id: Number(root.id ?? 0),
    status: str(root.status, "SUBMITTED"),
    document_type: str(root.document_type),
  };
}

async function getSelfKycAuditTrail(basePath: string): Promise<KycAuditTrailResponse> {
  const response = await apiFetch<unknown>(`${basePath}/audit-trail/`);
  const root = (response ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results)
    ? (root.results as unknown[]).map(normalizeAction)
    : [];
  return {
    owner_type: str(root.owner_type),
    owner_id: Number(root.owner_id ?? 0),
    results,
  };
}

export const listVendorSelfKycDocuments = () => listSelfKycDocuments("/vendor/kyc");
export const uploadVendorSelfKycDocument = (payload: SelfUploadPayload) =>
  uploadSelfKycDocument("/vendor/kyc", payload);
export const getVendorSelfKycAuditTrail = () => getSelfKycAuditTrail("/vendor/kyc");
export function buildVendorSelfKycDownloadPath(documentId: number): string {
  return `/api/v1/vendor/kyc/documents/${documentId}/download/`;
}

export const listStaffSelfKycDocuments = () => listSelfKycDocuments("/staff/kyc");
export const uploadStaffSelfKycDocument = (payload: SelfUploadPayload) =>
  uploadSelfKycDocument("/staff/kyc", payload);
export const getStaffSelfKycAuditTrail = () => getSelfKycAuditTrail("/staff/kyc");
export function buildStaffSelfKycDownloadPath(documentId: number): string {
  return `/api/v1/staff/kyc/documents/${documentId}/download/`;
}

// ---------------------------------------------------------------------------
// Admin: cross-owner KYC review queue (CRM-wide cockpit)
// ---------------------------------------------------------------------------

export type KycQueueRow = {
  owner_type: KycOwnerType;
  owner_id: number;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  document_id: number;
  document_type: string;
  category: string;
  status: string;
  uploaded_by: string | null;
  upload_source: string;
  uploaded_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string;
  download_url: string;
  allowed_actions: string[];
};

export type KycReviewQueueResponse = {
  count: number;
  summary: {
    total: number;
    by_status: Record<string, number>;
    by_owner_type: Record<string, number>;
  };
  results: KycQueueRow[];
};

export type KycReviewQueueFilters = {
  owner_type?: KycOwnerType | "";
  status?: string;
  document_type?: string;
  category?: string;
  search?: string;
  upload_source?: string;
  date_from?: string;
  date_to?: string;
};

function normalizeQueueRow(raw: unknown): KycQueueRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const actions = Array.isArray(r.allowed_actions)
    ? (r.allowed_actions as unknown[]).map((a) => String(a))
    : [];
  return {
    owner_type: str(r.owner_type).toLowerCase() as KycOwnerType,
    owner_id: Number(r.owner_id ?? 0),
    owner_name: str(r.owner_name),
    owner_phone: str(r.owner_phone),
    owner_email: str(r.owner_email),
    document_id: Number(r.document_id ?? 0),
    document_type: str(r.document_type),
    category: str(r.category),
    status: str(r.status, "SUBMITTED"),
    uploaded_by: strOrNull(r.uploaded_by),
    upload_source: str(r.upload_source),
    uploaded_at: strOrNull(r.uploaded_at),
    reviewed_by: strOrNull(r.reviewed_by),
    reviewed_at: strOrNull(r.reviewed_at),
    rejection_reason: str(r.rejection_reason),
    download_url: str(r.download_url),
    allowed_actions: actions,
  };
}

export async function listKycReviewQueue(
  filters: KycReviewQueueFilters = {}
): Promise<KycReviewQueueResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, String(value));
  }
  const query = params.toString();
  const response = await apiFetch<unknown>(
    `/admin/kyc/review-queue/${query ? `?${query}` : ""}`
  );
  const root = (response ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results)
    ? (root.results as unknown[]).map(normalizeQueueRow)
    : [];
  const summary = (root.summary ?? {}) as Record<string, unknown>;
  return {
    count: Number(root.count ?? results.length),
    summary: {
      total: Number(summary.total ?? results.length),
      by_status: (summary.by_status as Record<string, number>) ?? {},
      by_owner_type: (summary.by_owner_type as Record<string, number>) ?? {},
    },
    results,
  };
}

export async function approveKycQueueDocument(
  ownerType: KycOwnerType,
  documentId: number
): Promise<{ owner_type?: string; document_id?: number; status?: string }> {
  return apiFetch(`/admin/kyc/review-queue/${ownerType}/${documentId}/approve/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function rejectKycQueueDocument(
  ownerType: KycOwnerType,
  documentId: number,
  reason: string
): Promise<{ owner_type?: string; document_id?: number; status?: string }> {
  return apiFetch(`/admin/kyc/review-queue/${ownerType}/${documentId}/reject/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function requestKycQueueResubmission(
  ownerType: KycOwnerType,
  documentId: number,
  reason: string
): Promise<{ owner_type?: string; document_id?: number; status?: string }> {
  return apiFetch(
    `/admin/kyc/review-queue/${ownerType}/${documentId}/request-resubmission/`,
    { method: "POST", body: JSON.stringify({ reason }) }
  );
}

// ---------------------------------------------------------------------------
// Admin: CRM party KYC cockpit (resolves party -> linked canonical owner)
// ---------------------------------------------------------------------------

export type PartyKycLinkedOwner = {
  role_type: string;
  owner_type: KycOwnerType;
  owner_id: number;
  is_primary: boolean;
};

export type PartyKycResponse = {
  kyc_available: boolean;
  reason?: string;
  party_id: number;
  party_no?: string;
  display_name?: string;
  owner_type?: KycOwnerType;
  owner_id?: number;
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
  documents: KycQueueRow[];
  summary?: { total: number; by_status: Record<string, number> };
  linked_owners: PartyKycLinkedOwner[];
};

export async function getPartyKyc(partyId: number | string): Promise<PartyKycResponse> {
  const response = await apiFetch<unknown>(`/admin/crm/parties/${partyId}/kyc/`);
  const root = (response ?? {}) as Record<string, unknown>;
  const documents = Array.isArray(root.documents)
    ? (root.documents as unknown[]).map(normalizeQueueRow)
    : [];
  const linked = Array.isArray(root.linked_owners)
    ? (root.linked_owners as unknown[]).map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        return {
          role_type: str(r.role_type),
          owner_type: str(r.owner_type).toLowerCase() as KycOwnerType,
          owner_id: Number(r.owner_id ?? 0),
          is_primary: Boolean(r.is_primary),
        };
      })
    : [];
  return {
    kyc_available: Boolean(root.kyc_available),
    reason: typeof root.reason === "string" ? root.reason : undefined,
    party_id: Number(root.party_id ?? 0),
    party_no: typeof root.party_no === "string" ? root.party_no : undefined,
    display_name: typeof root.display_name === "string" ? root.display_name : undefined,
    owner_type:
      typeof root.owner_type === "string"
        ? (root.owner_type.toLowerCase() as KycOwnerType)
        : undefined,
    owner_id: root.owner_id == null ? undefined : Number(root.owner_id),
    owner_name: typeof root.owner_name === "string" ? root.owner_name : undefined,
    owner_phone: typeof root.owner_phone === "string" ? root.owner_phone : undefined,
    owner_email: typeof root.owner_email === "string" ? root.owner_email : undefined,
    documents,
    summary:
      root.summary && typeof root.summary === "object"
        ? {
            total: Number((root.summary as Record<string, unknown>).total ?? documents.length),
            by_status:
              ((root.summary as Record<string, unknown>).by_status as Record<string, number>) ?? {},
          }
        : undefined,
    linked_owners: linked,
  };
}

// ---------------------------------------------------------------------------
// Status display helpers
// ---------------------------------------------------------------------------

export const KYC_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  PENDING: "Pending Review",
  APPROVED: "Approved",
  VERIFIED: "Verified",
  EXCEPTION_APPROVED: "Exception Approved",
  REJECTED: "Rejected",
  RESUBMISSION_REQUIRED: "Resubmission Required",
};

export function kycStatusLabel(status: string): string {
  return KYC_STATUS_LABELS[status] ?? status;
}

export type KycStatusTone = "neutral" | "success" | "warning" | "danger";

export function kycStatusTone(status: string): KycStatusTone {
  switch (status) {
    case "APPROVED":
    case "VERIFIED":
    case "EXCEPTION_APPROVED":
      return "success";
    case "REJECTED":
      return "danger";
    case "RESUBMISSION_REQUIRED":
      return "warning";
    default:
      return "neutral";
  }
}
