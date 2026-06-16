"use client";

/**
 * KycDocumentPanel
 *
 * Reusable KYC intake & review panel backed entirely by the unified KYC
 * service in `@/services/kyc`. It has two modes:
 *
 *  - mode="admin": full review surface for a specific owner
 *    (customer / partner / vendor / staff). Admin can view, upload, approve,
 *    reject (reason required), request resubmission (reason required), and
 *    inspect the audit trail.
 *
 *  - mode="self": self-service surface for the logged-in owner of a portal
 *    (partner / vendor / staff). The user can view their own document status,
 *    upload, resubmit a rejected/resubmission-required document, and view their
 *    own audit trail. Approve / reject controls are NEVER rendered in this mode.
 *
 * Status display rules (no fabricated states):
 *  - Zero documents  -> "Missing" empty state.
 *  - SUBMITTED/PENDING -> "Submitted" / "Pending Review" (Under Review).
 *  - REJECTED -> shows the backend rejection reason.
 *  - APPROVED / VERIFIED / EXCEPTION_APPROVED -> approved, only from backend.
 * The component never derives or assumes a "Verified" state on its own.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  approveAdminKycDocument,
  buildAdminKycDownloadPath,
  buildPartnerSelfKycDownloadPath,
  buildStaffSelfKycDownloadPath,
  buildVendorSelfKycDownloadPath,
  getAdminKycAuditTrail,
  getPartnerSelfKycAuditTrail,
  getStaffSelfKycAuditTrail,
  getVendorSelfKycAuditTrail,
  kycStatusLabel,
  kycStatusTone,
  listAdminKycDocuments,
  listPartnerSelfKycDocuments,
  listStaffSelfKycDocuments,
  listVendorSelfKycDocuments,
  rejectAdminKycDocument,
  requestAdminKycResubmission,
  uploadAdminKycDocument,
  uploadPartnerSelfKycDocument,
  uploadStaffSelfKycDocument,
  uploadVendorSelfKycDocument,
  type KycDocumentRecord,
  type KycOwnerType,
  type KycReviewActionRecord,
  type KycStatusTone,
} from "@/services/kyc";

// Backend validation mirrors (kyc_workflow_service.ALLOWED_CONTENT_TYPES /
// MAX_FILE_SIZE_BYTES). Surfaced client-side for fast feedback; the backend
// remains the source of truth and its error text is shown on rejection.
const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const ACCEPT_ATTR = "image/jpeg,image/png,application/pdf";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

type SelfPortal = "partner" | "vendor" | "staff";

type AdminProps = {
  mode: "admin";
  owner: KycOwnerType;
  ownerId: number | string;
  title?: string;
  description?: string;
};

type SelfProps = {
  mode: "self";
  portal: SelfPortal;
  title?: string;
  description?: string;
};

export type KycDocumentPanelProps = AdminProps | SelfProps;

// Document type options per owner — mirrors the backend *KycDocumentType
// TextChoices so uploads are never rejected for an unknown type.
const DOCUMENT_TYPES: Record<KycOwnerType, Array<{ value: string; label: string }>> = {
  customer: [
    { value: "AADHAAR", label: "Aadhaar Card" },
    { value: "PAN", label: "PAN Card" },
    { value: "PASSPORT", label: "Passport" },
    { value: "DRIVING_LICENSE", label: "Driving License" },
    { value: "VOTER_ID", label: "Voter ID" },
    { value: "OTHER", label: "Other" },
  ],
  partner: [
    { value: "AADHAAR", label: "Aadhaar Card" },
    { value: "PAN", label: "PAN Card" },
    { value: "PASSPORT", label: "Passport" },
    { value: "DRIVING_LICENSE", label: "Driving License" },
    { value: "VOTER_ID", label: "Voter ID" },
    { value: "GST_CERTIFICATE", label: "GST Certificate" },
    { value: "BANK_PROOF", label: "Bank Proof" },
    { value: "OTHER", label: "Other" },
  ],
  vendor: [
    { value: "AADHAAR", label: "Aadhaar Card" },
    { value: "PAN", label: "PAN Card" },
    { value: "PASSPORT", label: "Passport" },
    { value: "DRIVING_LICENSE", label: "Driving License" },
    { value: "VOTER_ID", label: "Voter ID" },
    { value: "GST_CERTIFICATE", label: "GST Certificate" },
    { value: "BANK_PROOF", label: "Bank Proof" },
    { value: "INCORPORATION_CERTIFICATE", label: "Incorporation Certificate" },
    { value: "OTHER", label: "Other" },
  ],
  staff: [
    { value: "AADHAAR", label: "Aadhaar Card" },
    { value: "PAN", label: "PAN Card" },
    { value: "PASSPORT", label: "Passport" },
    { value: "DRIVING_LICENSE", label: "Driving License" },
    { value: "VOTER_ID", label: "Voter ID" },
    { value: "BANK_PROOF", label: "Bank Proof" },
    { value: "OTHER", label: "Other" },
  ],
};

const PORTAL_OWNER: Record<SelfPortal, KycOwnerType> = {
  partner: "partner",
  vendor: "vendor",
  staff: "staff",
};

function toneClass(tone: KycStatusTone): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "danger":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass(
        kycStatusTone(status)
      )}`}
    >
      {kycStatusLabel(status)}
    </span>
  );
}

function formatBytes(size: number): string {
  if (!size || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    const raw = error.message.trim();
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.detail === "string" && parsed.detail.trim()) {
        return parsed.detail;
      }
      for (const [field, value] of Object.entries(parsed)) {
        if (Array.isArray(value) && value.length > 0) return `${field}: ${String(value[0])}`;
        if (typeof value === "string" && value.trim()) return `${field}: ${value}`;
      }
    } catch {
      return raw;
    }
    return raw;
  }
  return fallback;
}

const inputClass =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring";
const btnPrimary =
  "inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60";
const btnGhost =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-50";

export default function KycDocumentPanel(props: KycDocumentPanelProps) {
  const isAdmin = props.mode === "admin";
  const owner: KycOwnerType = isAdmin ? props.owner : PORTAL_OWNER[props.portal];

  const documentTypeOptions = DOCUMENT_TYPES[owner];

  const [documents, setDocuments] = useState<KycDocumentRecord[]>([]);
  const [auditTrail, setAuditTrail] = useState<KycReviewActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Upload form state
  const [docType, setDocType] = useState(documentTypeOptions[0]?.value ?? "OTHER");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [resubmissionOf, setResubmissionOf] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Per-document review state (admin only)
  const [actionDocId, setActionDocId] = useState<number | null>(null);
  const [actionKind, setActionKind] = useState<"reject" | "resubmission" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadList = useCallback(async (): Promise<KycDocumentRecord[]> => {
    if (props.mode === "admin") {
      return (await listAdminKycDocuments(props.owner, props.ownerId)).results;
    }
    switch (props.portal) {
      case "partner":
        return (await listPartnerSelfKycDocuments()).results;
      case "vendor":
        return (await listVendorSelfKycDocuments()).results;
      case "staff":
        return (await listStaffSelfKycDocuments()).results;
    }
  }, [props]);

  const loadAudit = useCallback(async (): Promise<KycReviewActionRecord[]> => {
    if (props.mode === "admin") {
      return (await getAdminKycAuditTrail(props.owner, props.ownerId)).results;
    }
    switch (props.portal) {
      case "partner":
        return (await getPartnerSelfKycAuditTrail()).results;
      case "vendor":
        return (await getVendorSelfKycAuditTrail()).results;
      case "staff":
        return (await getStaffSelfKycAuditTrail()).results;
    }
  }, [props]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [docsResult, auditResult] = await Promise.allSettled([loadList(), loadAudit()]);
    if (docsResult.status === "fulfilled") {
      setDocuments(docsResult.value);
      setLoadError(null);
    } else {
      setDocuments([]);
      setLoadError(toErrorMessage(docsResult.reason, "Unable to load KYC documents."));
    }
    // Audit trail is supplementary: a failure must not blank the document list.
    setAuditTrail(auditResult.status === "fulfilled" ? auditResult.value : []);
    setLoading(false);
  }, [loadAudit, loadList]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function validateFile(candidate: File): string | null {
    if (!ALLOWED_CONTENT_TYPES.includes(candidate.type)) {
      return "File must be a JPG, PNG, or PDF.";
    }
    if (candidate.size <= 0) {
      return "File appears to be empty.";
    }
    if (candidate.size > MAX_FILE_SIZE_BYTES) {
      return "File must be 5 MB or smaller.";
    }
    return null;
  }

  function onSelectFile(next: File | null) {
    setUploadError(null);
    setUploadSuccess(null);
    if (next) {
      const validation = validateFile(next);
      if (validation) {
        setFile(null);
        setUploadError(validation);
        return;
      }
    }
    setFile(next);
  }

  async function performUpload() {
    if (!file) {
      setUploadError("Please select a document file.");
      return;
    }
    const validation = validateFile(file);
    if (validation) {
      setUploadError(validation);
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const trimmedNotes = notes.trim() || undefined;
      if (props.mode === "admin") {
        await uploadAdminKycDocument(props.owner, props.ownerId, {
          document_type: docType,
          file,
          notes: trimmedNotes,
        });
      } else {
        const payload = {
          document_type: docType,
          file,
          notes: trimmedNotes,
          ...(resubmissionOf != null ? { resubmission_of: resubmissionOf } : {}),
        };
        if (props.portal === "partner") await uploadPartnerSelfKycDocument(payload);
        else if (props.portal === "vendor") await uploadVendorSelfKycDocument(payload);
        else await uploadStaffSelfKycDocument(payload);
      }
      setUploadSuccess(
        resubmissionOf != null
          ? "Document resubmitted for review."
          : isAdmin
          ? "Document uploaded."
          : "Document submitted for review. An admin will review it shortly."
      );
      setFile(null);
      setNotes("");
      setResubmissionOf(null);
      await refresh();
    } catch (err) {
      setUploadError(toErrorMessage(err, "Upload failed."));
    } finally {
      setUploading(false);
    }
  }

  function beginResubmission(doc: KycDocumentRecord) {
    setResubmissionOf(doc.id);
    setDocType(doc.document_type || docType);
    setUploadError(null);
    setUploadSuccess(null);
    setFile(null);
  }

  function openAction(docId: number, kind: "reject" | "resubmission") {
    setActionDocId(docId);
    setActionKind(kind);
    setActionReason("");
    setActionError(null);
  }

  function closeAction() {
    setActionDocId(null);
    setActionKind(null);
    setActionReason("");
    setActionError(null);
  }

  async function approve(docId: number) {
    if (props.mode !== "admin") return;
    setActionBusy(true);
    setActionError(null);
    try {
      await approveAdminKycDocument(props.owner, props.ownerId, docId);
      closeAction();
      await refresh();
    } catch (err) {
      setActionError(toErrorMessage(err, "Could not approve document."));
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmReasonedAction() {
    if (props.mode !== "admin" || actionDocId == null || actionKind == null) return;
    const reason = actionReason.trim();
    if (!reason) {
      setActionError("A reason is required.");
      return;
    }
    setActionBusy(true);
    setActionError(null);
    try {
      if (actionKind === "reject") {
        await rejectAdminKycDocument(props.owner, props.ownerId, actionDocId, reason);
      } else {
        await requestAdminKycResubmission(props.owner, props.ownerId, actionDocId, reason);
      }
      closeAction();
      await refresh();
    } catch (err) {
      setActionError(toErrorMessage(err, "Action failed."));
    } finally {
      setActionBusy(false);
    }
  }

  function downloadHref(docId: number): string {
    if (props.mode === "admin") {
      return buildAdminKycDownloadPath(props.owner, props.ownerId, docId);
    }
    switch (props.portal) {
      case "partner":
        return buildPartnerSelfKycDownloadPath(docId);
      case "vendor":
        return buildVendorSelfKycDownloadPath(docId);
      case "staff":
        return buildStaffSelfKycDownloadPath(docId);
    }
  }

  const title = props.title ?? (isAdmin ? "KYC Documents & Review" : "KYC Verification");
  const description =
    props.description ??
    (isAdmin
      ? "Review uploaded identity documents. Approvals, rejections, and resubmission requests are recorded in the audit trail."
      : "Upload identity documents for KYC verification. Admin approval is required — documents do not auto-approve.");

  const overallEmpty = documents.length === 0;

  const ownerLabel = useMemo(() => owner.charAt(0).toUpperCase() + owner.slice(1), [owner]);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" data-kyc-panel data-kyc-mode={props.mode}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <button type="button" className={btnGhost} onClick={() => void refresh()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Upload form */}
      <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {resubmissionOf != null ? `Resubmit document #${resubmissionOf}` : isAdmin ? `Upload ${ownerLabel} document` : "Submit KYC document"}
          </h3>
          {resubmissionOf != null ? (
            <button type="button" className={btnGhost} onClick={() => setResubmissionOf(null)}>
              Cancel resubmission
            </button>
          ) : null}
        </div>

        {uploadError ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {uploadError}
          </div>
        ) : null}
        {uploadSuccess ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {uploadSuccess}
          </div>
        ) : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Document type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className={inputClass}
              disabled={uploading}
            >
              {documentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Document file <span className="text-red-600">*</span>
            </label>
            <input
              type="file"
              accept={ACCEPT_ATTR}
              onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
              disabled={uploading}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm file:mr-3 file:text-xs"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for the reviewer"
              disabled={uploading}
              className={inputClass}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Accepted: JPG, PNG, or PDF up to 5 MB.</p>
        <div className="mt-3 flex justify-end">
          <button type="button" className={btnPrimary} onClick={() => void performUpload()} disabled={uploading || !file}>
            {uploading ? "Uploading…" : resubmissionOf != null ? "Resubmit document" : "Submit for review"}
          </button>
        </div>
      </div>

      {/* Document list */}
      <div className="mt-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Documents</h3>
        {loadError ? (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {loadError}
          </div>
        ) : null}
        {!loadError && loading && overallEmpty ? (
          <div className="mt-2 text-sm text-muted-foreground">Loading documents…</div>
        ) : null}
        {!loadError && !loading && overallEmpty ? (
          <div className="mt-2 rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center">
            <div className="text-sm font-semibold text-foreground">Missing</div>
            <div className="mt-1 text-xs text-muted-foreground">No KYC documents have been submitted yet.</div>
          </div>
        ) : null}

        {!overallEmpty ? (
          <ul className="mt-2 space-y-2">
            {documents.map((doc) => {
              const isActionOpen = actionDocId === doc.id && actionKind != null;
              const canResubmit =
                doc.status === "REJECTED" || doc.status === "RESUBMISSION_REQUIRED";
              return (
                <li key={doc.id} className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{doc.document_type || "Document"}</span>
                        <StatusPill status={doc.status} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {doc.original_filename || "Unnamed file"} · {formatBytes(doc.file_size)}
                        {doc.created_at ? ` · ${formatDateTime(doc.created_at)}` : ""}
                      </div>
                      {doc.uploaded_by ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">Uploaded by {doc.uploaded_by}</div>
                      ) : null}
                      {doc.status === "REJECTED" && doc.rejection_reason ? (
                        <div className="mt-1 text-xs font-medium text-red-700">Reason: {doc.rejection_reason}</div>
                      ) : null}
                      {doc.reviewed_by ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Reviewed by {doc.reviewed_by}
                          {doc.reviewed_at ? ` · ${formatDateTime(doc.reviewed_at)}` : ""}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={downloadHref(doc.id)} target="_blank" rel="noreferrer" className={btnGhost}>
                        View file
                      </a>
                      {props.mode === "admin" ? (
                        <>
                          <button
                            type="button"
                            className={btnGhost}
                            onClick={() => void approve(doc.id)}
                            disabled={actionBusy}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            onClick={() => openAction(doc.id, "reject")}
                            disabled={actionBusy}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            onClick={() => openAction(doc.id, "resubmission")}
                            disabled={actionBusy}
                          >
                            Request resubmission
                          </button>
                        </>
                      ) : canResubmit ? (
                        <button type="button" className={btnGhost} onClick={() => beginResubmission(doc)}>
                          Resubmit
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {props.mode === "admin" && isActionOpen ? (
                    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                      <label className="text-xs font-medium text-muted-foreground">
                        {actionKind === "reject" ? "Rejection reason" : "Resubmission reason"}{" "}
                        <span className="text-red-600">*</span>
                      </label>
                      <textarea
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                        placeholder="Explain what the owner must correct…"
                      />
                      {actionError ? (
                        <div className="mt-2 text-xs font-medium text-red-700">{actionError}</div>
                      ) : null}
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" className={btnGhost} onClick={closeAction} disabled={actionBusy}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={btnPrimary}
                          onClick={() => void confirmReasonedAction()}
                          disabled={actionBusy || !actionReason.trim()}
                        >
                          {actionBusy
                            ? "Submitting…"
                            : actionKind === "reject"
                            ? "Confirm rejection"
                            : "Request resubmission"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {/* Audit trail */}
      <div className="mt-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Audit trail</h3>
        {auditTrail.length === 0 ? (
          <div className="mt-2 text-sm text-muted-foreground">No review actions recorded yet.</div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {auditTrail.map((action) => (
              <li
                key={action.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-foreground">{action.action || "ACTION"}</span>
                  {action.old_status || action.new_status ? (
                    <span className="ml-2 text-muted-foreground">
                      {action.old_status || "—"} → {action.new_status || "—"}
                    </span>
                  ) : null}
                  {action.reason ? <span className="ml-2 text-muted-foreground">· {action.reason}</span> : null}
                </div>
                <div className="text-muted-foreground">
                  {action.performed_by ? `${action.performed_by} · ` : ""}
                  {formatDateTime(action.performed_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
