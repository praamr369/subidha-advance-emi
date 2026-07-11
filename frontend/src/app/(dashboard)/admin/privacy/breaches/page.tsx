"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Breach = {
  id: number;
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "DETECTED" | "INVESTIGATING" | "CONTAINED" | "RESOLVED";
  detected_at: string;
  affected_records: number;
  notified_at: string | null;
  description: string;
};

const SEV_COLOR: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

export default function DataBreachesPage() {
  const [breaches, setBreaches] = useState<Breach[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", severity: "MEDIUM", description: "", affected_records: 0 });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch("/api/v1/privacy/data-breaches/")
      .then((d) => setBreaches(Array.isArray(d) ? d as Breach[] : ((d as { results?: Breach[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [submitting]);

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/privacy/data-breaches/", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({ title: "", severity: "MEDIUM", description: "", affected_records: 0 });
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  const handleNotify = async (id: number) => {
    await apiFetch(`/api/v1/privacy/data-breaches/${id}/notify/`, { method: "POST" });
    setBreaches((prev) => prev.map((b) => b.id === id ? { ...b, notified_at: new Date().toISOString() } : b));
  };

  const unnotified72h = breaches.filter((b) => {
    const hours = (Date.now() - new Date(b.detected_at).getTime()) / 3600000;
    return !b.notified_at && hours > 72;
  });

  return (
    <ERPPageShell
      title="Incident & Data Breach Log"
      subtitle="DPDP 2023 Section 8 — notify affected parties as soon as possible after detection"
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Privacy", href: "/admin/privacy/compliance" }, { label: "Breaches" }]}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">
            + Report Incident
          </button>
        </div>
        {unnotified72h.length > 0 && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-400 rounded-xl">
            <div className="font-bold text-red-800 dark:text-red-200">⚠️ {unnotified72h.length} breach(es) unnotified for over 72 hours — action required</div>
            <div className="text-sm text-red-700 mt-1">DPDP 2023 Section 8 requires notification of affected Data Principals as soon as possible after a personal data breach is detected.</div>
          </div>
        )}

        {showForm && (
          <WorkspaceSection title="Report New Incident">
            <form onSubmit={handleReport} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Incident Title *</label>
                  <input type="text" required className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                    value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Severity</label>
                  <select className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                    value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                    {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Affected Records</label>
                  <input type="number" min={0} className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                    value={form.affected_records} onChange={(e) => setForm({ ...form, affected_records: Number(e.target.value) })} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 resize-none" rows={3}
                    value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                  {submitting ? "Reporting..." : "Report Incident"}
                </button>
              </div>
            </form>
          </WorkspaceSection>
        )}

        <WorkspaceSection title="All Incidents">
          {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}
          {!loading && breaches.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              <div className="text-4xl mb-3">🛡️</div>
              <p className="font-medium">No incidents reported</p>
            </div>
          )}
          {breaches.map((b) => {
            const hours = (Date.now() - new Date(b.detected_at).getTime()) / 3600000;
            const isOverdue = !b.notified_at && hours > 72;
            return (
              <div key={b.id} className={`p-4 border rounded-lg mb-3 ${isOverdue ? "border-red-400" : ""}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{b.title}</div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      Detected: {new Date(b.detected_at).toLocaleString("en-IN")} · {b.affected_records} records
                    </div>
                    <div className="text-sm text-gray-600 mt-1 line-clamp-2">{b.description}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEV_COLOR[b.severity]}`}>{b.severity}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{b.status}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4">
                  {b.notified_at ? (
                    <span className="text-xs text-green-600">✅ Notified {new Date(b.notified_at).toLocaleDateString("en-IN")}</span>
                  ) : (
                    <button onClick={() => handleNotify(b.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg text-white ${isOverdue ? "bg-red-600 hover:bg-red-700" : "bg-orange-500 hover:bg-orange-600"}`}>
                      {isOverdue ? "⚠️ Send Notification NOW" : "Notify Affected Parties"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
