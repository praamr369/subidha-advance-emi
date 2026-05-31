"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import PageHeader from "@/components/ui/PageHeader";
import { ApiError } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import {
  createComplianceDocument,
  getAdminComplianceSummary,
  getBusinessComplianceReadiness,
  listComplianceDocuments,
  listComplianceTemplates,
  seedBusinessComplianceRows,
  updateComplianceDocument,
  type ComplianceDocument,
  type ComplianceDocumentType,
  type ComplianceReadiness,
  type ComplianceSummary,
  type ComplianceTemplate,
  type ComplianceVerificationStatus,
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

const statusLabels: Record<ComplianceVerificationStatus, string> = {
  PENDING: "Pending review",
  VERIFIED: "Approved / verified",
  REJECTED: "Rejected",
  NOT_PROVIDED: "Not provided",
};

const initialDoc: Partial<ComplianceDocument> = {
  document_type: "OTHER",
  title: "",
  public_visibility: "PRIVATE",
  verification_status: "PENDING",
  public_summary: "",
  notes: "",
  is_active: true,
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
  if (status === "VERIFIED" || status === "APPROVED") return "green" as const;
  if (status === "PENDING") return "amber" as const;
  if (status === "REJECTED" || status === "MISSING") return "red" as const;
  return "slate" as const;
}

function readinessTone(status?: string) {
  if (status === "READY") return "green" as const;
  if (status === "NEEDS_SETUP") return "amber" as const;
  return "red" as const;
}

export default function AdminBusinessCompliancePage() {
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [readiness, setReadiness] = useState<ComplianceReadiness | null>(null);
  const [templates, setTemplates] = useState<ComplianceTemplate[]>([]);
  const [rows, setRows] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ComplianceDocument>>(initialDoc);
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
      const row = rows.find((item) => item.document_type === template.document_type && item.title === template.label);
      if (row) map.set(template.key, row);
    }
    return map;
  }, [rows, templates]);

  const statusCards = useMemo(() => {
    const approved = (type: ComplianceDocumentType) => rows.some((row) => row.document_type === type && row.verification_status === "VERIFIED" && row.is_active);
    const premises = rows.some((row) => ["OWNERSHIP_PROOF", "RENTAL_AGREEMENT"].includes(row.document_type) && row.verification_status === "VERIFIED" && row.is_active);
    const address = rows.some((row) => ["SHOP_LICENSE", "OTHER"].includes(row.document_type) && row.verification_status === "VERIFIED" && row.is_active);
    return [
      { label: "Business identity", value: summary?.business_name || "Not configured", status: readiness?.status || "BLOCKED" },
      { label: "Premises proof", value: premises ? "Approved evidence exists" : "Missing approved ownership/rental proof", status: premises ? "READY" : "BLOCKED" },
      { label: "Business address proof", value: address ? "Approved evidence exists" : "Missing approved address evidence", status: address ? "READY" : "BLOCKED" },
      { label: "PAN / tax proof", value: approved("PAN_OR_TAX_PROOF") ? "Approved evidence exists" : "Missing approved tax proof", status: approved("PAN_OR_TAX_PROOF") ? "READY" : "BLOCKED" },
      { label: "Bank proof", value: approved("BANK_PROOF") ? "Approved evidence exists" : "Missing approved bank proof", status: approved("BANK_PROOF") ? "READY" : "BLOCKED" },
      { label: "GST status", value: summary?.gst_status_text || "Not provided", status: approved("GST_CERTIFICATE") ? "READY" : "NEEDS_SETUP" },
      { label: "Udyam/MSME status", value: summary?.udyam_status_text || "Not provided", status: approved("UDYAM_CERTIFICATE") ? "READY" : "NEEDS_SETUP" },
      { label: "Public summary", value: summary?.public_documents?.length ? `${summary.public_documents.length} approved public summaries` : "No approved public summaries", status: summary?.public_documents?.length ? "READY" : "NEEDS_SETUP" },
    ];
  }, [readiness?.status, rows, summary]);

  function applyTemplate(template: ComplianceTemplate) {
    setSelectedTemplateKey(template.key);
    setForm({
      document_type: template.document_type,
      title: template.label,
      public_visibility: template.visibility_default,
      verification_status: "PENDING",
      public_summary: "",
      notes: `Template: ${template.key}. ${template.recommended_action}`,
      is_active: true,
    });
  }

  async function handleSeedRows() {
    try {
      setSeeding(true);
      const result = await seedBusinessComplianceRows();
      setMessage(`Compliance checklist seeded. created=${result.created_count}, skipped=${result.skipped_count}. Rows are PRIVATE and PENDING until real evidence is reviewed.`);
      await loadData();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSeeding(false);
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      await createComplianceDocument(form);
      setMessage("Compliance document row created as private/pending unless explicitly changed by admin.");
      setForm(initialDoc);
      setSelectedTemplateKey("");
      await loadData();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisibility(row: ComplianceDocument) {
    try {
      setSaving(true);
      await updateComplianceDocument(row.id, {
        public_visibility: row.public_visibility === "PRIVATE" ? "PUBLIC_SUMMARY_ONLY" : "PRIVATE",
      });
      await loadData();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business compliance governance"
        description="Actual shop identity, registration, certificates, bank proof, premises proof, and approved public summaries. Separate from Policy Governance."
        actions={
          <>
            <Link href={ROUTES.admin.settingsPolicies} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent">
              Policy governance
            </Link>
            <Link href={ROUTES.admin.settings} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent">
              Settings
            </Link>
          </>
        }
      />

      <section className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100">
        Private compliance files are never publicly downloadable by default. GST and Udyam/MSME must remain “Not provided” unless actual verified evidence exists. Only approved public-safe summaries may appear publicly.
      </section>

      {message ? <section className="rounded-2xl border border-emerald-300/70 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-100">{message}</section> : null}
      {error ? <section className="rounded-2xl border border-red-300/70 bg-red-50/90 p-4 text-sm text-red-900 shadow-sm dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-100">{error}</section> : null}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Compliance status</h2>
            <p className="mt-1 text-sm text-muted-foreground">Setup readiness uses approved evidence only. Seeded empty rows do not make the system ready.</p>
          </div>
          {readiness ? <span className={badgeClass(readinessTone(readiness.status))}>{readiness.status}</span> : null}
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {statusCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">{card.label}</div>
                  <span className={badgeClass(readinessTone(card.status))}>{card.status}</span>
                </div>
                <div className="mt-2 text-sm text-foreground">{card.value}</div>
              </div>
            ))}
          </div>
        )}
        {readiness ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs uppercase text-muted-foreground">Missing required</div><div className="mt-1 text-2xl font-semibold">{readiness.missing_required_count}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs uppercase text-muted-foreground">Pending review</div><div className="mt-1 text-2xl font-semibold">{readiness.pending_review_count}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs uppercase text-muted-foreground">Approved required</div><div className="mt-1 text-2xl font-semibold">{readiness.approved_required_count}/{readiness.required_count}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs uppercase text-muted-foreground">Recommended missing</div><div className="mt-1 text-2xl font-semibold">{readiness.recommended_missing_count}</div></div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Premade compliance checklist</h2>
            <p className="mt-1 text-sm text-muted-foreground">Templates create operational checklist rows only. They are not legal publication and do not verify registration.</p>
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
                    <span className={badgeClass(row ? statusTone(row.verification_status) : "red")}>{row ? statusLabels[row.verification_status] : "Missing row"}</span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{template.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">Exposure rule: {template.allowed_public_exposure}. {template.readiness_impact}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => applyTemplate(template)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent">
                    {row ? "Add another row from template" : "Add row from template"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Public summary preview</h2>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
        ) : summary ? (
          <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
            <p><strong className="text-foreground">Business:</strong> {summary.business_name}</p>
            <p><strong className="text-foreground">Location:</strong> {summary.business_location}</p>
            <p><strong className="text-foreground">GST status:</strong> {summary.gst_status_text}</p>
            <p><strong className="text-foreground">Udyam status:</strong> {summary.udyam_status_text}</p>
            <p><strong className="text-foreground">Public documents:</strong> {summary.public_documents.length ? `${summary.public_documents.length} approved summary item(s)` : "No approved public summaries"}</p>
            <p><strong className="text-foreground">Disclaimer:</strong> {summary.private_document_disclaimer}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Add compliance document row</h2>
        {selectedTemplateKey ? <p className="mt-1 text-sm text-muted-foreground">Selected template: {selectedTemplateKey}. Status defaults to PENDING and files remain private.</p> : null}
        <form className="mt-4 grid gap-3" onSubmit={handleCreate}>
          <select value={form.document_type || "OTHER"} onChange={(event) => setForm((current) => ({ ...current, document_type: event.target.value as ComplianceDocumentType }))} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
            {docTypeOptions.map((option) => <option key={option} value={option}>{docTypeLabels[option]}</option>)}
          </select>
          <input value={form.title || ""} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Title" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
          <div className="grid gap-3 md:grid-cols-2">
            <select value={form.public_visibility || "PRIVATE"} onChange={(event) => setForm((current) => ({ ...current, public_visibility: event.target.value as ComplianceVisibility }))} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value="PRIVATE">Private file / internal only</option>
              <option value="PUBLIC_SUMMARY_ONLY">Public summary only after approval</option>
            </select>
            <select value={form.verification_status || "PENDING"} onChange={(event) => setForm((current) => ({ ...current, verification_status: event.target.value as ComplianceVerificationStatus }))} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value="PENDING">Pending review</option>
              <option value="VERIFIED">Approved / verified</option>
              <option value="REJECTED">Rejected</option>
              <option value="NOT_PROVIDED">Not provided</option>
            </select>
          </div>
          <textarea value={form.public_summary || ""} onChange={(event) => setForm((current) => ({ ...current, public_summary: event.target.value }))} placeholder="Only approved public summaries are shown publicly. Private files are never downloadable by default." className="min-h-[90px] rounded-xl border border-input bg-background px-3 py-2 text-sm" />
          <textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Internal notes for admin review only" className="min-h-[80px] rounded-xl border border-input bg-background px-3 py-2 text-sm" />
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
            <table className="min-w-[980px] w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Visibility</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Public summary</th>
                  <th className="px-3 py-2">Reviewed</th>
                  <th className="px-3 py-2">Expires</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="px-3 py-2 text-muted-foreground">{docTypeLabels[row.document_type] || row.document_type}</td>
                    <td className="px-3 py-2 text-foreground">{row.title || "-"}</td>
                    <td className="px-3 py-2"><span className={badgeClass(row.public_visibility === "PRIVATE" ? "slate" : "blue")}>{row.public_visibility}</span></td>
                    <td className="px-3 py-2"><span className={badgeClass(statusTone(row.verification_status))}>{statusLabels[row.verification_status]}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{row.public_summary_ready ? "Approved summary ready" : row.public_summary ? "Summary saved, not public until verified" : "No public summary"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.reviewed_by_username || row.verified_at || "Pending"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.expires_at || "Not exposed"}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => toggleVisibility(row)} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent" disabled={saving}>Toggle summary visibility</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
