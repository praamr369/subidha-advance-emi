"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";
import { apiPaths } from "@/lib/api-paths";
import { useFieldErrors } from "@/lib/form-validation";
import { z } from "zod";

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
  const [agentForm, setAgentForm] = useState({ condition: "GOOD", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch(apiPaths.refunds.inspectionJobs)
      .then((d) => setJobs(Array.isArray(d) ? d as InspectionJob[] : ((d as { results?: InspectionJob[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [submitting]);

  // Display only. The server computes the real figure from the same table
  // (subscriptions.enums.DAMAGE_DEDUCTION_PERCENT); if the two ever disagree,
  // the server's number is the one the customer is charged.
  const DEDUCTION_BANDS: Record<string, number> = {
    GOOD: 0,
    MINOR: 10,
    MAJOR: 25,
    SEVERE: 50,
  };

  // Mirrors the server's rule: a grade is required, and anything worse than
  // GOOD must say why, because a deduction that is not explained cannot be
  // justified to the customer or a consumer forum.
  const assessmentSchema = z
    .object({
      damage_grade: z.enum(["GOOD", "MINOR", "MAJOR", "SEVERE"]),
      assessment_notes: z.string(),
    })
    .refine(
      (value) => value.damage_grade === "GOOD" || value.assessment_notes.length > 0,
      { path: ["assessment_notes"], message: "Describe the damage before deducting." }
    );

  const { fieldErrors, validate, fieldProps } = useFieldErrors(assessmentSchema);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitInspection = async () => {
    if (!selected) return;

    // The deduction is NOT sent. It is derived server-side from the grade
    // (Good 0%, Minor 10%, Major 25%, Severe 50%), which is the whole point of
    // the banded policy — a figure typed by whoever happens to be inspecting
    // is the discretion the bands exist to remove.
    const parsed = validate({
      damage_grade: agentForm.condition,
      assessment_notes: agentForm.notes.trim(),
    });
    if (!parsed) return;

    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(apiPaths.refunds.assessDamage(selected.id), {
        method: "POST",
        body: JSON.stringify(parsed),
      });
      setSelected(null);
    } catch (err) {
      // Was `catch { // silent }`. An assessment that appears to save and does
      // not is worse than a visible failure: the customer is told a figure
      // nobody recorded.
      setError(err instanceof Error ? err.message : "Could not save the assessment.");
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
                onClick={() => { setSelected(job); setAgentForm({ condition: "GOOD", notes: "" }); }}
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
                <label htmlFor="f-agent-condition-assessment" className="block text-sm font-medium mb-1">Agent Condition Assessment *</label>
                <select id="f-agent-condition-assessment"
                  className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                  value={agentForm.condition}
                  onChange={(e) => setAgentForm({ ...agentForm, condition: e.target.value })}
                >
                  {Object.keys(DEDUCTION_BANDS).map((c) => (
                    <option key={c} value={c}>{`${c} — ${DEDUCTION_BANDS[c]}% deduction`}</option>
                  ))}
                </select>
              </div>

              {/* Read-only. The deduction follows from the grade, so it is
                  shown rather than typed — a figure entered by hand is exactly
                  the discretion the banded policy was chosen to remove, and it
                  is the number a customer disputes. */}
              <div>
                <span className="block text-sm font-medium mb-1">Deduction applied</span>
                <p className="w-full border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-900 dark:border-gray-600 text-sm">
                  <strong>{DEDUCTION_BANDS[agentForm.condition] ?? 0}%</strong>{" "}
                  <span className="text-gray-500">of the amount paid, set by the grade above</span>
                </p>
              </div>

              <div>
                <label htmlFor="f-inspection-notes" className="block text-sm font-medium mb-1">Inspection Notes</label>
                <textarea id="f-inspection-notes"
                  className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 resize-none"
                  rows={3}
                  value={agentForm.notes}
                  onChange={(e) => setAgentForm({ ...agentForm, notes: e.target.value })}
                  placeholder="Describe damage found, photos taken, etc."
                  {...fieldProps("assessment_notes")}
                />
                {fieldErrors.assessment_notes && (
                  <p id="assessment_notes-error" className="mt-1 text-xs text-red-600">
                    {fieldErrors.assessment_notes}
                  </p>
                )}
              </div>
              {error && (
                <p role="alert" className="text-xs text-red-600">{error}</p>
              )}

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
