"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Subscription = { id: number; product_name: string; subscription_number: string; product_id: number };
type ExtendedPlan = { months: number; cost_percentage: number; estimated_cost: number };

export default function ExtendedWarrantyPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [selectedSub, setSelectedSub] = useState("");
  const [plans, setPlans] = useState<ExtendedPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/v1/customer/subscriptions/?page_size=50")
      .then((d) => setSubs(Array.isArray(d) ? d as Subscription[] : ((d as { results?: Subscription[] })?.results ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSub) { setPlans([]); return; }
    const sub = subs.find((s) => String(s.id) === selectedSub);
    if (!sub) return;
    apiFetch(`/api/v1/warranty/extended-plans/${sub.product_id}/`)
      .then((d) => setPlans(Array.isArray(d) ? d as ExtendedPlan[] : ((d as { plans?: ExtendedPlan[] })?.plans ?? [])))
      .catch(() => setPlans([
        { months: 12, cost_percentage: 2, estimated_cost: 0 },
        { months: 24, cost_percentage: 3.5, estimated_cost: 0 },
        { months: 36, cost_percentage: 5, estimated_cost: 0 },
      ]));
  }, [selectedSub, subs]);

  const handleEnroll = async () => {
    if (!selectedSub || selectedPlan === null) {
      setError("Select a subscription and a plan.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/v1/warranty/enroll-extended/", {
        method: "POST",
        body: JSON.stringify({ subscription_id: selectedSub, months: selectedPlan }),
      });
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Enrollment failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <ERPPageShell title="Extended Warranty Enrollment" subtitle="Enrollment confirmed">
        <div className="max-w-md mx-auto text-center py-12">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold mb-2">Enrolled Successfully!</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">Your extended warranty is now active. You'll receive a confirmation.</p>
          <div className="flex gap-3 mt-6 justify-center">
            <a href="/customer/warranty/check" className="px-4 py-2 border rounded-lg text-sm">Check Coverage</a>
            <a href="/customer/dashboard" className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm">Back to Dashboard</a>
          </div>
        </div>
      </ERPPageShell>
    );
  }

  return (
    <ERPPageShell
      title="Extended Warranty"
      subtitle="Extend protection beyond the standard warranty period"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Warranty", href: "/customer/warranty/check" },
        { label: "Extended Warranty" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <WorkspaceSection title="Extended Warranty Plans">
          <div>
            <label className="block text-sm font-medium mb-1">Select Product</label>
            <select
              className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 mb-4"
              value={selectedSub}
              onChange={(e) => { setSelectedSub(e.target.value); setSelectedPlan(null); }}
            >
              <option value="">Choose a subscription...</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>{s.subscription_number} — {s.product_name}</option>
              ))}
            </select>

            {plans.length > 0 && (
              <div className="space-y-3">
                <label className="block text-sm font-medium">Choose a Plan</label>
                {plans.map((plan) => (
                  <label key={plan.months} className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    selectedPlan === plan.months ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20" : "border-gray-200 hover:border-gray-300"
                  }`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="plan"
                        checked={selectedPlan === plan.months}
                        onChange={() => setSelectedPlan(plan.months)}
                      />
                      <div>
                        <div className="font-semibold">{plan.months}-Month Extension</div>
                        <div className="text-xs text-gray-500">{plan.cost_percentage}% of product value</div>
                      </div>
                    </div>
                    {plan.estimated_cost > 0 && (
                      <div className="font-bold text-orange-700">₹{plan.estimated_cost.toLocaleString("en-IN")}</div>
                    )}
                  </label>
                ))}
              </div>
            )}

            {error && <div className="mt-3 text-red-600 text-sm">{error}</div>}

            {selectedSub && plans.length > 0 && (
              <button
                onClick={handleEnroll}
                disabled={submitting || selectedPlan === null}
                className="mt-4 w-full py-2 px-4 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 disabled:opacity-50"
              >
                {submitting ? "Processing..." : "Enroll in Extended Warranty"}
              </button>
            )}
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="What's Included">
          <ul className="text-sm space-y-1 list-disc list-inside text-blue-800 dark:text-blue-200">
            <li>All manufacturing and structural defect coverage</li>
            <li>Priority technician scheduling</li>
            <li>Same coverage terms as standard warranty</li>
            <li>Transferable if product ownership changes</li>
          </ul>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
