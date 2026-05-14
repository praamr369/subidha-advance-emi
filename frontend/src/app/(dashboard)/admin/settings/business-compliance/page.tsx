"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import PageHeader from "@/components/ui/PageHeader";
import { ApiError } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import {
  createComplianceDocument,
  getAdminComplianceSummary,
  listComplianceDocuments,
  updateComplianceDocument,
  type ComplianceDocument,
  type ComplianceSummary,
} from "@/services/policies";

const docTypeOptions = [
  "RENTAL_AGREEMENT",
  "OWNERSHIP_PROOF",
  "UDYAM_CERTIFICATE",
  "GST_CERTIFICATE",
  "SHOP_LICENSE",
  "BANK_PROOF",
  "PAN_OR_TAX_PROOF",
  "OTHER",
] as const;

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
  if (error instanceof ApiError) {
    return error.readableMessage || error.message;
  }
  return error instanceof Error ? error.message : "Request failed.";
}

export default function AdminBusinessCompliancePage() {
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [rows, setRows] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ComplianceDocument>>(initialDoc);

  async function loadData() {
    try {
      setLoading(true);
      const [summaryPayload, docsPayload] = await Promise.all([
        getAdminComplianceSummary(),
        listComplianceDocuments(),
      ]);
      setSummary(summaryPayload);
      setRows(docsPayload.results);
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

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      await createComplianceDocument(form);
      setMessage("Compliance document row created.");
      setForm(initialDoc);
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
        public_visibility:
          row.public_visibility === "PRIVATE" ? "PUBLIC_SUMMARY_ONLY" : "PRIVATE",
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
        description="Admin-only storage and public-safe disclosure controls for business compliance documents and registration status text."
        actions={
          <>
            <Link
              href={ROUTES.admin.settingsPolicies}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent"
            >
              Policy governance
            </Link>
            <Link
              href={ROUTES.admin.settings}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent"
            >
              Settings
            </Link>
          </>
        }
      />

      <section className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100">
        Sensitive files (ownership proof, PAN, Aadhaar, bank proof, agreements, certificates) are private by default. Public pages should show summary text only after review.
      </section>

      {message ? (
        <section className="rounded-2xl border border-emerald-300/70 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-100">
          {message}
        </section>
      ) : null}
      {error ? (
        <section className="rounded-2xl border border-red-300/70 bg-red-50/90 p-4 text-sm text-red-900 shadow-sm dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-100">
          {error}
        </section>
      ) : null}

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
            <p><strong className="text-foreground">Disclaimer:</strong> {summary.private_document_disclaimer}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Add compliance document row</h2>
        <form className="mt-4 grid gap-3" onSubmit={handleCreate}>
          <select
            value={form.document_type || "OTHER"}
            onChange={(event) => setForm((current) => ({ ...current, document_type: event.target.value }))}
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
          >
            {docTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <input
            value={form.title || ""}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Title"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />

          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={form.public_visibility || "PRIVATE"}
              onChange={(event) => setForm((current) => ({ ...current, public_visibility: event.target.value as "PRIVATE" | "PUBLIC_SUMMARY_ONLY" }))}
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="PRIVATE">PRIVATE</option>
              <option value="PUBLIC_SUMMARY_ONLY">PUBLIC_SUMMARY_ONLY</option>
            </select>
            <select
              value={form.verification_status || "PENDING"}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  verification_status: event.target.value as
                    | "PENDING"
                    | "VERIFIED"
                    | "REJECTED"
                    | "NOT_PROVIDED",
                }))
              }
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="PENDING">PENDING</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="NOT_PROVIDED">NOT_PROVIDED</option>
            </select>
          </div>

          <textarea
            value={form.public_summary || ""}
            onChange={(event) => setForm((current) => ({ ...current, public_summary: event.target.value }))}
            placeholder="Public-safe summary (required if PUBLIC_SUMMARY_ONLY)"
            className="min-h-[90px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />

          <textarea
            value={form.notes || ""}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Internal notes"
            className="min-h-[80px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />

          <div>
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Saving..." : "Add row"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Compliance document register</h2>

        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No rows yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Visibility</th>
                  <th className="px-3 py-2">Verification</th>
                  <th className="px-3 py-2">Public summary</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="px-3 py-2 text-muted-foreground">{row.document_type}</td>
                    <td className="px-3 py-2 text-foreground">{row.title || "-"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.public_visibility}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.verification_status}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.public_summary || "-"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleVisibility(row)}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent"
                        disabled={saving}
                      >
                        Toggle visibility
                      </button>
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
