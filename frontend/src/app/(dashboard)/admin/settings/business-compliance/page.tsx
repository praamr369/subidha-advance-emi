"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import PageHeader from "@/components/ui/PageHeader";
import { ApiError } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import {
  approveComplianceDocument,
  approveCompliancePublicSummary,
  createComplianceDocument,
  expireComplianceDocument,
  getAdminComplianceSummary,
  getBusinessComplianceReadiness,
  listComplianceDocuments,
  listComplianceTemplates,
  rejectComplianceDocument,
  revokeCompliancePublicSummary,
  seedBusinessComplianceRows,
  submitComplianceDocumentForReview,
  updateComplianceDocument,
  type ComplianceDocument,
  type ComplianceDocumentType,
  type ComplianceReadiness,
  type ComplianceReviewStatus,
  type ComplianceSummary,
  type ComplianceTemplate,
  type ComplianceVisibility,
} from "@/services/policies";

const docTypeLabels: Record<ComplianceDocumentType, string> = {
  RENTAL_AGREEMENT: "Rental agreement",
  OWNERSHIP_PROOF: "Ownership proof",
  UDYAM_CERTIFICATE: "Udyam certificate",
  GST_CERTIFICATE: "GST certificate",
  SHOP_LICENSE: "Shop / trade license",
  BANK_PROOF: "Bank proof",
  PAN_OR_TAX_PROOF: "PAN / tax proof",
  OTHER: "Other compliance proof",
};

const docTypeOptions = Object.keys(docTypeLabels) as ComplianceDocumentType[];

const reviewStatusLabels: Record<ComplianceReviewStatus, string> = {
  PENDING: "Pending evidence review",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved evidence",
  REJECTED: "Rejected",
  EXPIRED: "Expired / inactive",
};

type ComplianceFormState = {
  document_type: ComplianceDocumentType;
  title: string;
  public_visibility: ComplianceVisibility;
  public_summary: string;
  notes: string;
  file: File | null;
};

const initialForm: ComplianceFormState = {
  document_type: "OTHER",
  title: "",
  public_visibility: "PRIVATE",
  public_summary: "",
  notes: "",
  file: null,
};

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.readableMessage || error.message;
  return error instanceof Error ? error.message : "Request failed.";
}

function badgeClass(tone: "green" | "amber" | "red" | "blue" | "slate") {
  const map = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return `inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${map[tone]}`;
}

function levelTone(level: string) {
  if (level === "REQUIRED") return "red" as const;
  if (level === "RECOMMENDED") return "amber" as const;
  return "slate" as const;
}

function statusTone(status?: string) {
  if (status === "APPROVED" || status === "VERIFIED" || status === "READY") return "green" as const;
  if (status === "PENDING" || status === "UNDER_REVIEW" || status === "NEEDS_SETUP") return "amber" as const;
  if (status === "REJECTED" || status === "EXPIRED" || status === "MISSING" || status === "BLOCKED") return "red" as const;
  return "slate" as const;
}

function reviewLabel(row: ComplianceDocument): string {
  const status = row.review_status || "PENDING";
  return reviewStatusLabels[status] || status;
}

function buildComplianceFormData(form: ComplianceFormState): FormData {
  const formData = new FormData();
  formData.set("document_type", form.document_type);
  formData.set("title", form.title.trim());
  formData.set("public_visibility", form.public_visibility);
  formData.set("verification_status", "PENDING");
  formData.set("public_summary", form.public_summary.trim());
  formData.set("notes", form.notes.trim());
  formData.set("is_active", "true");
  if (form.file) formData.set("file", form.file);
  return formData;
}

function canApprovePublicSummary(row: ComplianceDocument): boolean {
  return Boolean(row.review_status === "APPROVED" && row.public_visibility === "PUBLIC_SUMMARY_ONLY" && row.public_summary?.trim() && !row.public_summary_ready);
}

export default function AdminBusinessCompliancePage() {
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [readiness, setReadiness] = useState<ComplianceReadiness | null>(null);
  const [templates, setTemplates] = useState<ComplianceTemplate[]>([]);
  const [rows, setRows] = useState<ComplianceDocument[]>([]);
  const [selectedRow, setSelectedRow] = useState<ComplianceDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<ComplianceFormState>(initialForm);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("");

  async function loadData() {
    try {
      setLoading(true);
      const [summaryPayload, docsPayload, templatesPayload, readinessPayload] = await Promise.all([
        getAdminComplianceSummary(),
        listComplianceDocuments(),
        listComplianceTemplates(),
        getBusinessComplianceReadiness(),
      ]);
      setSummary(summaryPayload);
      setRows(docsPayload.results);
      setTemplates(templatesPayload.results);
      setReadiness(readinessPayload);
      setSelectedRow((current) => (current ? docsPayload.results.find((row) => row.id === current.id) || null : null));
      setError(null);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const rowsByTemplate = useMemo(() => {
    const map = new Map<string, ComplianceDocument>();
    for (const template of templates) {
      const row = rows.find((item) => item.source_template_key === template.key || (item.document_type === template.document_type && item.title === template.label));
      if (row) map.set(template.key, row);
    }
    return map;
  }, [rows, templates]);

  const statusCards = useMemo(() => {
    const requiredApproved = readiness?.approved_required_count || 0;
    const requiredTotal = readiness?.required_count || 0;
    return [
      { label: "Overall readiness", value: readiness?.status || "BLOCKED", status: readiness?.status || "BLOCKED" },
      { label: "Required approved", value: `${requiredApproved}/${requiredTotal}`, status: requiredApproved === requiredTotal && requiredTotal > 0 ? "READY" : "BLOCKED" },
      { label: "Missing files", value: String(readiness?.missing_file_count || 0), status: readiness?.missing_file_count ? "BLOCKED" : "READY" },
      { label: "Pending review", value: String(readiness?.pending_review_count || 0), status: readiness?.pending_review_count ? "NEEDS_SETUP" : "READY" },
      { label: "Rejected", value: String(readiness?.rejected_count || 0), status: readiness?.rejected_count ? "BLOCKED" : "READY" },
      { label: "Expired", value: String(readiness?.expired_count || 0), status: readiness?.expired_count ? "NEEDS_SETUP" : "READY" },
      { label: "Public summary pending", value: String(readiness?.public_summary_pending_count || 0), status: readiness?.public_summary_pending_count ? "NEEDS_SETUP" : "READY" },
      { label: "Public summaries", value: summary?.public_documents?.length ? `${summary.public_documents.length} approved` : "None approved", status: summary?.public_documents?.length ? "READY" : "NEEDS_SETUP" },
    ];
  }, [readiness, summary]);

  function applyTemplate(template: ComplianceTemplate) {
    setSelectedTemplateKey(template.key);
    setForm({
      document_type: template.document_type,
      title: template.label,
      public_visibility: template.visibility_default,
      public_summary: "",
      notes: `Template: ${template.key}. ${template.recommended_action}`,
      file: null,
    });
  }

  async function handleSeedRows() {
    try {
      setSeeding(true);
      setError(null);
      const result = await seedBusinessComplianceRows();
      setMessage(`Compliance checklist seeded. created=${result.created_count}, skipped=${result.skipped_count}. Rows remain private and pending until real evidence is reviewed.`);
      await loadData();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSeeding(false);
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await createComplianceDocument(buildComplianceFormData(form));
      setMessage(form.file ? "Compliance document created with evidence file. Submit for review before approval." : "Compliance row created. Upload real evidence before approval.");
      setForm(initialForm);
      setSelectedTemplateKey("");
      event.currentTarget.reset();
      await loadData();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadEvidence(row: ComplianceDocument, file: File | null) {
    if (!file) return;
    try {
      setActionId(row.id);
      setError(null);
      const formData = new FormData();
      formData.set("file", file);
      await updateComplianceDocument(row.id, formData);
      setMessage("Evidence file uploaded. Review status reset to pending and public summary approval revoked.");
      await loadData();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setActionId(null);
    }
  }

  async function performAction(row: ComplianceDocument, action: "submit" | "approve" | "reject" | "expire" | "approve-summary" | "revoke-summary") {
    try {
      setActionId(row.id);
      setError(null);
      if (action === "submit") {
        await submitComplianceDocumentForReview(row.id);
        setMessage("Document submitted for admin review.");
      } else if (action === "approve") {
        await approveComplianceDocument(row.id, { public_summary_approved: false });
        setMessage("Evidence approved. Public summary remains separate until explicitly approved.");
      } else if (action === "reject") {
        const reason = window.prompt("Reason for rejection")?.trim();
        if (!reason) return;
        await rejectComplianceDocument(row.id, reason);
        setMessage("Document rejected with reason. Upload corrected evidence before approval.");
      } else if (action === "expire") {
        const reason = window.prompt("Reason for expiry/deactivation")?.trim();
        if (!reason) return;
        await expireComplianceDocument(row.id, reason);
        setMessage("Document expired/deactivated. History is preserved.");
      } else if (action === "approve-summary") {
        await approveCompliancePublicSummary(row.id);
        setMessage("Public-safe summary approved. Source file remains private.");
      } else if (action === "revoke-summary") {
        await revokeCompliancePublicSummary(row.id);
        setMessage("Public summary approval revoked.");
      }
      await loadData();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business compliance governance"
        description="Actual shop identity, registration, certificates, bank proof, premises proof, private evidence files, and approved public-safe summaries. Separate from Policy Governance."
        actions={
          <>
            <Link href={ROUTES.admin.setupReadiness} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent">
              Setup readiness
            </Link>
            <Link href={ROUTES.admin.settingsPolicies} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent">
              Policy governance
            </Link>
          </>
        }
      />

      <section className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100">
        Private compliance files are never publicly downloadable by default. GST and Udyam/MSME must remain “Not provided” unless actual verified evidence exists. Public pages expose only separately approved public-safe summaries.
      </section>

      {message ? <section className="rounded-2xl border border-emerald-300/70 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-100">{message}</section> : null}
      {error ? <section className="rounded-2xl border border-red-300/70 bg-red-50/90 p-4 text-sm text-red-900 shadow-sm dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-100">{error}</section> : null}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Compliance review status</h2>
            <p className="mt-1 text-sm text-muted-foreground">Setup readiness uses approved evidence with real files only. Seeded rows and public summaries do not approve themselves.</p>
          </div>
          {readiness ? <span className={badgeClass(statusTone(readiness.status))}>{readiness.status}</span> : null}
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {statusCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">{card.label}</div>
                  <span className={badgeClass(statusTone(card.status))}>{card.status}</span>
                </div>
                <div className="mt-2 text-sm text-foreground">{card.value}</div>
              </div>
            ))}
          </div>
        )}
        {readiness?.blockers?.length ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <div className="font-semibold">Blockers</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {readiness.blockers.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null}
        {readiness?.warnings?.length ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">Warnings</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {readiness.warnings.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Premade compliance checklist</h2>
            <p className="mt-1 text-sm text-muted-foreground">Templates create checklist rows only. They do not verify registration, create legal publication, or expose files.</p>
          </div>
          <button type="button" onClick={handleSeedRows} disabled={seeding} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60">
            {seeding ? "Seeding..." : "Seed required/recommended rows"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {templates.map((template) => {
            const row = rowsByTemplate.get(template.key);
            return (
              <article key={template.key} className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{template.label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{docTypeLabels[template.document_type]} · {template.key}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={badgeClass(levelTone(template.required_level))}>{template.required_level}</span>
                    <span className={badgeClass(template.visibility_default === "PRIVATE" ? "slate" : "blue")}>{template.visibility_default}</span>
                    <span className={badgeClass(row ? statusTone(row.review_status || row.status) : "red")}>{row ? reviewLabel(row) : "Missing row"}</span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{template.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">Exposure rule: {template.allowed_public_exposure}. {template.readiness_impact}</p>
                <button type="button" onClick={() => applyTemplate(template)} className="mt-3 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent">
                  {row ? "Add another row from template" : "Add row from template"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Public summary preview</h2>
        {summary ? (
          <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
            <p><strong className="text-foreground">Business:</strong> {summary.business_name}</p>
            <p><strong className="text-foreground">Location:</strong> {summary.business_location}</p>
            <p><strong className="text-foreground">GST status:</strong> {summary.gst_status_text}</p>
            <p><strong className="text-foreground">Udyam status:</strong> {summary.udyam_status_text}</p>
            <p><strong className="text-foreground">Public documents:</strong> {summary.public_documents.length ? `${summary.public_documents.length} approved summary item(s)` : "No approved public summaries"}</p>
            <p><strong className="text-foreground">Disclaimer:</strong> {summary.private_document_disclaimer}</p>
          </div>
        ) : <p className="mt-2 text-sm text-muted-foreground">Loading...</p>}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Add compliance document row</h2>
        {selectedTemplateKey ? <p className="mt-1 text-sm text-muted-foreground">Selected template: {selectedTemplateKey}. Status defaults to pending. Upload real evidence before approval.</p> : null}
        <form className="mt-4 grid gap-3" onSubmit={handleCreate}>
          <select value={form.document_type} onChange={(event) => setForm((current) => ({ ...current, document_type: event.target.value as ComplianceDocumentType }))} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
            {docTypeOptions.map((option) => <option key={option} value={option}>{docTypeLabels[option]}</option>)}
          </select>
          <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Title" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
          <div className="grid gap-3 md:grid-cols-2">
            <select value={form.public_visibility} onChange={(event) => setForm((current) => ({ ...current, public_visibility: event.target.value as ComplianceVisibility }))} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value="PRIVATE">Private file / internal only</option>
              <option value="PUBLIC_SUMMARY_ONLY">Public summary only after separate approval</option>
            </select>
            <input type="file" onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] || null }))} className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <textarea value={form.public_summary} onChange={(event) => setForm((current) => ({ ...current, public_summary: event.target.value }))} placeholder="Public-safe summary. This is not visible publicly until evidence and summary are separately approved." className="min-h-[90px] rounded-xl border border-input bg-background px-3 py-2 text-sm" />
          <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Internal notes for admin review only" className="min-h-[80px] rounded-xl border border-input bg-background px-3 py-2 text-sm" />
          <div>
            <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60" disabled={saving}>{saving ? "Saving..." : "Add row"}</button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Compliance document register</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No rows yet. Seed checklist or add first compliance row.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Evidence</th>
                  <th className="px-3 py-2">Review status</th>
                  <th className="px-3 py-2">Public summary</th>
                  <th className="px-3 py-2">Reviewed</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 align-top">
                    <td className="px-3 py-3 text-muted-foreground">{docTypeLabels[row.document_type] || row.document_type}</td>
                    <td className="px-3 py-3 text-foreground">
                      <button type="button" onClick={() => setSelectedRow(row)} className="text-left font-semibold underline-offset-2 hover:underline">{row.title || "Untitled"}</button>
                      <div className="mt-1 text-xs text-muted-foreground">{row.source_template_key || "manual-row"}</div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      <span className={badgeClass(row.has_file ? "green" : "red")}>{row.has_file ? "File uploaded" : "No file"}</span>
                      <input type="file" aria-label={`Upload evidence for ${row.title || row.id}`} onChange={(event) => void handleUploadEvidence(row, event.target.files?.[0] || null)} className="mt-2 block w-48 text-xs" disabled={actionId === row.id} />
                    </td>
                    <td className="px-3 py-3"><span className={badgeClass(statusTone(row.review_status || row.status))}>{reviewLabel(row)}</span></td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {row.public_summary_ready ? "Approved public summary" : row.public_summary ? "Saved, not publicly approved" : "No summary"}
                      <div className="mt-1 text-xs">{row.public_visibility}</div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{row.reviewed_by_username || row.reviewed_at || row.verified_at || "Pending"}</td>
                    <td className="px-3 py-3">
                      <div className="flex max-w-[360px] flex-wrap gap-2">
                        <button type="button" onClick={() => void performAction(row, "submit")} disabled={actionId === row.id || row.review_status === "APPROVED" || row.review_status === "EXPIRED"} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50">Submit</button>
                        <button type="button" onClick={() => void performAction(row, "approve")} disabled={actionId === row.id || !row.has_file || row.review_status === "APPROVED" || row.review_status === "EXPIRED"} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50">Approve</button>
                        <button type="button" onClick={() => void performAction(row, "reject")} disabled={actionId === row.id || row.review_status === "EXPIRED"} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-800 disabled:opacity-50">Reject</button>
                        <button type="button" onClick={() => void performAction(row, "expire")} disabled={actionId === row.id || row.review_status === "EXPIRED"} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50">Expire</button>
                        <button type="button" onClick={() => void performAction(row, "approve-summary")} disabled={actionId === row.id || !canApprovePublicSummary(row)} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800 disabled:opacity-50">Approve summary</button>
                        <button type="button" onClick={() => void performAction(row, "revoke-summary")} disabled={actionId === row.id || !row.public_summary_ready} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50">Revoke summary</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRow ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Document review detail</h2>
              <p className="mt-1 text-sm text-muted-foreground">{selectedRow.title || "Untitled"} · {docTypeLabels[selectedRow.document_type]}</p>
            </div>
            <button type="button" onClick={() => setSelectedRow(null)} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-accent">Close detail</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs uppercase text-muted-foreground">Review status</div><div className="mt-1 text-sm font-semibold">{reviewLabel(selectedRow)}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs uppercase text-muted-foreground">Evidence uploaded</div><div className="mt-1 text-sm font-semibold">{selectedRow.evidence_uploaded_at || "No file timestamp"}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs uppercase text-muted-foreground">Public summary</div><div className="mt-1 text-sm font-semibold">{selectedRow.public_summary_ready ? "Approved" : "Not approved"}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs uppercase text-muted-foreground">Expiry</div><div className="mt-1 text-sm font-semibold">{selectedRow.expires_at || "Not set"}</div></div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground"><strong className="text-foreground">Public summary:</strong><p className="mt-1 whitespace-pre-wrap">{selectedRow.public_summary || "No public summary text."}</p></div>
            <div className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground"><strong className="text-foreground">Internal notes / reason:</strong><p className="mt-1 whitespace-pre-wrap">{selectedRow.last_action_reason || selectedRow.rejected_reason || selectedRow.notes || "No internal note."}</p></div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
