"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { fetchActiveSubscriptionsForRefund, submitRefundRequest } from "@/services/customer-portal";

type Subscription = { id: number; product_name: string; subscription_number: string };

export default function RefundRequestPage() {
  const router = useRouter();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [form, setForm] = useState({
    subscription_id: "",
    reason: "",
    notes: "",
    pickup_address: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchActiveSubscriptionsForRefund()
      .then((d) => setSubs(Array.isArray(d) ? d as Subscription[] : ((d as { results?: Subscription[] })?.results ?? [])))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subscription_id || !form.reason) {
      setError("Subscription and reason are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitRefundRequest(form);
      router.push(`/customer/refunds/status/${(res as { id: number }).id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const REASONS = [
    { value: "NOT_SATISFIED", label: "Not satisfied with product" },
    { value: "DEFECTIVE", label: "Product is defective" },
    { value: "WRONG_ITEM", label: "Wrong item delivered" },
    { value: "NOT_DELIVERED", label: "Item not delivered" },
    { value: "CHANGED_MIND", label: "Changed my mind (within 7 days)" },
    { value: "OTHER", label: "Other reason" },
  ];

  return (
    <ERPPageShell
      title="Request a Return / Refund"
      subtitle="Our 7-day no-questions return policy — Consumer Protection Act 2019 rights apply"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Returns & Refunds", href: "/customer/refunds/history" },
        { label: "New Request" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <WorkspaceSection title="Return Policy Summary">
          <ul className="text-sm space-y-1 list-disc list-inside text-blue-800 dark:text-blue-200">
            <li>Days 1–7: Full refund, no questions asked (Subidha policy)</li>
            <li>Days 8–30: 10% restocking fee deducted</li>
            <li>After 30 days: Subject to warranty/damage assessment</li>
            <li>Refund processed within 2–14 business days</li>
          </ul>
        </WorkspaceSection>

        <WorkspaceSection title="Submit Return Request">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Select Subscription *</label>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                value={form.subscription_id}
                onChange={(e) => setForm({ ...form, subscription_id: e.target.value })}
                required
              >
                <option value="">Choose a subscription...</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subscription_number} — {s.product_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Reason for Return *</label>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                required
              >
                <option value="">Select a reason...</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Additional Details</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 resize-none"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Describe the issue in detail..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Pickup Address</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 resize-none"
                rows={2}
                value={form.pickup_address}
                onChange={(e) => setForm({ ...form, pickup_address: e.target.value })}
                placeholder="Address for pickup (if different from delivery address)"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting..." : "Submit Return Request"}
            </button>
          </form>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
