"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type InspectionJob = {
  id: number;
  refund_request_id: number;
  customer_name: string;
  product_name: string;
  subscription_number: string;
  pickup_date: string | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED";
  self_condition: string;
  agent_condition: string | null;
  deduction_percentage: number;
  deduction_amount: number;
};

const CONDITION_OPTIONS = ["LIKE_NEW", "GOOD", "FAIR", "DAMAGED", "SEVERELY_DAMAGED"];

export default function ReturnInspectionPage() {
  const [jobs, setJobs] = useState<InspectionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<InspectionJob | null>(null);
  const [agentForm, setAgentForm] = useState({ condition: "GOOD", deduction_pct: 0, notes: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch("/api/v1/refunds/inspection-jobs/")
      .then((d) => setJobs(Array.isArray(d) ? d as InspectionJob[] : ((d as { results?: InspectionJob[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [submitting]);

  const handleSubmitInspection = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/v1/refunds/inspect/${selected.id}/`, {
        method: "POST",
        body: JSON.stringify({
          agent_condition: agentForm.condition,
          deduction_percentage: agentForm.deduction_pct,
          notes: agentForm.notes,
        }),
      });
      setSelected(null);
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ERPPageShell
      title="Return Damage Inspection"
      subtitle="Inspect returned items and record condition assessment"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Returns", href: "/admin/refunds/process" },
        { label: "Inspection" },
      ]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WorkspaceSection title={`${jobs.length} Pending Inspection${jobs.length !== 1 ? "s" : ""}`}>
          {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}
          {!loading && jobs.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-medium">All inspections complete</p>
            </div>
          )}
          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                onClick={() => { setSelected(job); setAgentForm({ condition: "GOOD", deduction_pct: 0, notes: "" }); }}
                className={`p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${selected?.id === job.id ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : ""}`}
              >
                <div className="font-medium">{job.product_name}</div>
                <div className="text-sm text-gray-500">{job.customer_name} · {job.subscription_number}</div>
                <div className="flex gap-3 mt-2 text-xs text-gray-500">
                  <span>Self: <strong>{job.self_condition}</strong></span>
                  {job.pickup_date && <span>Pickup: {new Date(job.pickup_date).toLocaleDateString("en-IN")}</span>}
                </div>
              </div>
            ))}
          </div>
        </WorkspaceSection>

        {selected && (
          <WorkspaceSection title="Complete Inspection">
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                <div className="font-medium">{selected.product_name}</div>
                <div className="text-gray-500">{selected.customer_name} — Customer reported: <strong>{selected.self_condition}</strong></div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Agent Condition Assessment *</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                  value={agentForm.condition}
                  onChange={(e) => setAgentForm({ ...agentForm, condition: e.target.value })}
                >
                  {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Deduction % (0–100)</label>
                <input
                  type="number"
                  min={0} max={100}
                  className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                  value={agentForm.deduction_pct}
                  onChange={(e) => setAgentForm({ ...agentForm, deduction_pct: Number(e.target.value) })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Inspection Notes</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 resize-none"
                  rows={3}
                  value={agentForm.notes}
                  onChange={(e) => setAgentForm({ ...agentForm, notes: e.target.value })}
                  placeholder="Describe damage found, photos taken, etc."
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setSelected(null)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
                <button
                  onClick={handleSubmitInspection}
                  disabled={submitting}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Submit Inspection"}
                </button>
              </div>
            </div>
          </WorkspaceSection>
        )}
      </div>
    </ERPPageShell>
  );
}
