"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Request = { id: number; request_type: string; status: string; created_at: string; completed_at: string | null };

const REQUEST_TYPES = [
  { value: "ACCESS", label: "Access my data", description: "Get a copy of all personal data we hold about you" },
  { value: "CORRECTION", label: "Correct my data", description: "Fix inaccurate or incomplete personal information" },
  { value: "ERASURE", label: "Erase my data", description: "Request deletion of your personal data (right to be forgotten)" },
  { value: "PORTABILITY", label: "Data portability", description: "Receive your data in a machine-readable format" },
  { value: "RESTRICT", label: "Restrict processing", description: "Limit how we use your personal data" },
];

export default function DataAccessPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [form, setForm] = useState({ request_type: "ACCESS", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    apiFetch("/api/v1/privacy/data-access-request/")
      .then((d) => setRequests(Array.isArray(d) ? d as Request[] : ((d as { results?: Request[] })?.results ?? [])))
      .catch(() => {});
  }, [submitted]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/v1/privacy/data-access-request/", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSubmitted(true);
      setForm({ request_type: "ACCESS", notes: "" });
      setTimeout(() => setSubmitted(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ERPPageShell
      title="Data Access Requests"
      subtitle="Exercise your rights under DPDP 2023 — responses within 30 days"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Privacy", href: "/customer/privacy/dashboard" },
        { label: "Data Access" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <WorkspaceSection title="Submit a Request">
          {submitted && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 rounded-lg text-sm mb-4">
              ✅ Request submitted. We will respond within 30 days as required by DPDP 2023.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Request Type *</label>
              <div className="space-y-2">
                {REQUEST_TYPES.map((rt) => (
                  <label key={rt.value} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer ${
                    form.request_type === rt.value ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}>
                    <input type="radio" name="request_type" value={rt.value} checked={form.request_type === rt.value}
                      onChange={(e) => setForm({ ...form, request_type: e.target.value })} className="mt-1" />
                    <div>
                      <div className="font-medium text-sm">{rt.label}</div>
                      <div className="text-xs text-gray-500">{rt.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Additional Notes</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 resize-none"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Specify what data you're concerned about, or any other details..."
              />
            </div>
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <button type="submit" disabled={submitting}
              className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </form>
        </WorkspaceSection>

        {requests.length > 0 && (
          <WorkspaceSection title="Previous Requests">
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                  <div>
                    <div className="font-medium">{r.request_type?.replace(/_/g, " ")}</div>
                    <div className="text-xs text-gray-500">{new Date(r.created_at).toLocaleDateString("en-IN")}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                    r.status === "PENDING" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"
                  }`}>{r.status}</span>
                </div>
              ))}
            </div>
          </WorkspaceSection>
        )}
      </div>
    </ERPPageShell>
  );
}
