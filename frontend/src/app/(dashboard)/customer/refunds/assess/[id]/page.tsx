"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Assessment = {
  id: number;
  refund_request_id: number;
  condition: string;
  damage_percentage: number;
  deduction_amount: number;
  photos_required: boolean;
  notes: string;
};

export default function DamageAssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [form, setForm] = useState({ condition: "GOOD", notes: "", acknowledged: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/v1/refunds/assess-damage/?refund_request=${id}`)
      .then((d) => {
        const row = Array.isArray(d) ? (d as Assessment[])[0] : ((d as { results?: Assessment[] })?.results?.[0]);
        if (row) setAssessment(row);
      })
      .catch(() => {});
  }, [id]);

  const CONDITIONS = [
    { value: "LIKE_NEW", label: "Like New — no damage", deduction: 0 },
    { value: "GOOD", label: "Good — minor wear", deduction: 5 },
    { value: "FAIR", label: "Fair — visible use marks", deduction: 15 },
    { value: "DAMAGED", label: "Damaged — significant damage", deduction: 30 },
    { value: "SEVERELY_DAMAGED", label: "Severely Damaged", deduction: 50 },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.acknowledged) { setError("Please acknowledge the assessment."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/v1/refunds/assess-damage/", {
        method: "POST",
        body: JSON.stringify({ refund_request: id, condition: form.condition, notes: form.notes }),
      });
      router.push(`/customer/refunds/status/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ERPPageShell
      title="Damage Assessment"
      subtitle={`Return #${id} — self-assessment before pickup`}
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Returns", href: "/customer/refunds/history" },
        { label: "Assessment" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {assessment && (
          <WorkspaceSection title="Agent Assessment (if completed)">
            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div><span className="text-gray-500">Condition:</span> <strong>{assessment.condition}</strong></div>
              <div><span className="text-gray-500">Deduction:</span> <strong>₹{assessment.deduction_amount}</strong></div>
              <div className="col-span-2"><span className="text-gray-500">Notes:</span> {assessment.notes}</div>
            </div>
          </WorkspaceSection>
        )}

        <WorkspaceSection title="Self-Assessment Form">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Product Condition *</label>
              <div className="space-y-2">
                {CONDITIONS.map((c) => (
                  <label key={c.value} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input
                      type="radio"
                      name="condition"
                      value={c.value}
                      checked={form.condition === c.value}
                      onChange={(e) => setForm({ ...form, condition: e.target.value })}
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{c.label}</div>
                      {c.deduction > 0 && (
                        <div className="text-xs text-orange-600">~{c.deduction}% deduction may apply</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes about damage / condition</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 resize-none"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Describe any damage or marks..."
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.acknowledged}
                onChange={(e) => setForm({ ...form, acknowledged: e.target.checked })}
                className="mt-1"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                I confirm this assessment is accurate. I understand that deductions apply for damage beyond normal use.
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Confirm Assessment"}
            </button>
          </form>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
