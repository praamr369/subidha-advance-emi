"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Subscription = { id: number; product_name: string; subscription_number: string; product_id: number };

export default function WarrantyClaimPage() {
  const router = useRouter();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [form, setForm] = useState({
    subscription_id: "",
    defect_type: "MECHANICAL",
    description: "",
    preferred_date: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/v1/subscriptions/?page_size=50")
      .then((d) => setSubs(Array.isArray(d) ? d as Subscription[] : ((d as { results?: Subscription[] })?.results ?? [])))
      .catch(() => {});
  }, []);

  const DEFECT_TYPES = [
    { value: "MECHANICAL", label: "Mechanical / Moving parts failure" },
    { value: "ELECTRICAL", label: "Electrical / Electronics issue" },
    { value: "STRUCTURAL", label: "Structural / Frame damage" },
    { value: "COSMETIC", label: "Cosmetic defect (manufacturing)" },
    { value: "OTHER", label: "Other" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subscription_id || !form.description) {
      setError("Subscription and description are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const sub = subs.find((s) => String(s.id) === form.subscription_id);
      const res = await apiFetch("/api/v1/warranty/claim/", {
        method: "POST",
        body: JSON.stringify({
          subscription_id: form.subscription_id,
          product_id: sub?.product_id,
          defect_type: form.defect_type,
          description: form.description,
          preferred_service_date: form.preferred_date || null,
        }),
      });
      router.push(`/customer/warranty/status/${(res as { id: number }).id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ERPPageShell
      title="File Warranty Claim"
      subtitle="Report a defect covered under your product warranty"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Warranty", href: "/customer/warranty/check" },
        { label: "File Claim" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <WorkspaceSection title="What's Covered">
          <ul className="text-sm space-y-1 list-disc list-inside text-blue-800 dark:text-blue-200">
            <li>Manufacturing defects in materials or workmanship</li>
            <li>Structural failures under normal use</li>
            <li>Electrical component failures (appliances)</li>
            <li>BIS-standard compliance defects</li>
          </ul>
          <p className="text-xs text-gray-500 mt-2">Normal wear, accidental damage, and cosmetic issues from use are not covered.</p>
        </WorkspaceSection>

        <WorkspaceSection title="Claim Form">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Select Product *</label>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                value={form.subscription_id}
                onChange={(e) => setForm({ ...form, subscription_id: e.target.value })}
                required
              >
                <option value="">Choose a subscription...</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>{s.subscription_number} — {s.product_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Type of Defect *</label>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                value={form.defect_type}
                onChange={(e) => setForm({ ...form, defect_type: e.target.value })}
                required
              >
                {DEFECT_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Describe the Issue *</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 resize-none"
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the defect or problem in detail. When did it start? How does it affect use?"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Preferred Service Date</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                value={form.preferred_date}
                onChange={(e) => setForm({ ...form, preferred_date: e.target.value })}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 px-4 rounded-lg font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "File Warranty Claim"}
            </button>
          </form>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
