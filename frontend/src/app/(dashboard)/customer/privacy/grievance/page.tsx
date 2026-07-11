"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Grievance = { id: number; subject: string; status: string; created_at: string; resolved_at: string | null };

export default function PrivacyGrievancePage() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [form, setForm] = useState({ subject: "", description: "", grievance_type: "DATA_MISUSE" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const TYPES = [
    { value: "DATA_MISUSE", label: "Data misuse or unauthorised sharing" },
    { value: "CONSENT_VIOLATION", label: "Consent not respected" },
    { value: "DATA_BREACH", label: "Suspected data breach" },
    { value: "ACCESS_DENIED", label: "Data access request not fulfilled" },
    { value: "MARKETING_SPAM", label: "Unwanted marketing communications" },
    { value: "OTHER", label: "Other privacy concern" },
  ];

  useEffect(() => {
    apiFetch("/api/v1/privacy/grievance/")
      .then((d) => setGrievances(Array.isArray(d) ? d as Grievance[] : ((d as { results?: Grievance[] })?.results ?? [])))
      .catch(() => {});
  }, [submitted]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject || !form.description) { setError("Subject and description are required."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/v1/privacy/grievance/", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSubmitted(true);
      setForm({ subject: "", description: "", grievance_type: "DATA_MISUSE" });
      setTimeout(() => setSubmitted(false), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ERPPageShell
      title="Privacy Grievance"
      subtitle="Raise a privacy complaint — DPO responds within 30 days (DPDP 2023 Section 13)"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Privacy", href: "/customer/privacy/dashboard" },
        { label: "Grievance" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <WorkspaceSection title="File a Complaint">
          {submitted && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 rounded-lg text-sm mb-4">
              ✅ Grievance filed. Our DPO will respond within 30 days. If unresolved, you may escalate to the Data Protection Board of India.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Type of Concern *</label>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                value={form.grievance_type}
                onChange={(e) => setForm({ ...form, grievance_type: e.target.value })}
              >
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Subject *</label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Brief subject of your complaint"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description *</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 resize-none"
                rows={5}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe your concern in detail. Include dates, what happened, and what outcome you expect."
                required
              />
            </div>
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <button type="submit" disabled={submitting}
              className="w-full py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50">
              {submitting ? "Submitting..." : "File Grievance"}
            </button>
          </form>
        </WorkspaceSection>

        {grievances.length > 0 && (
          <WorkspaceSection title="Your Grievances">
            <div className="space-y-2">
              {grievances.map((g) => (
                <div key={g.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                  <div>
                    <div className="font-medium">#{g.id} — {g.subject}</div>
                    <div className="text-xs text-gray-500">{new Date(g.created_at).toLocaleDateString("en-IN")}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    g.status === "RESOLVED" ? "bg-green-100 text-green-700" :
                    g.status === "UNDER_REVIEW" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"
                  }`}>{g.status?.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          </WorkspaceSection>
        )}

        <WorkspaceSection title="Escalation Path">
          <ol className="text-sm space-y-2 list-decimal list-inside text-blue-800 dark:text-blue-200">
            <li>File grievance here → DPO responds within 30 days</li>
            <li>If unresolved → escalate to Data Protection Board of India</li>
            <li>Board resolution within 14 days</li>
          </ol>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
