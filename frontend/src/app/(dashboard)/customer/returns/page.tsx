"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type ReturnRequest = {
  id: number;
  subscription: number;
  subscription_number?: string;
  status: "FILED" | "WITHIN_WINDOW" | "OUTSIDE_WINDOW" | "CPA_OVERRIDE" | "APPROVED" | "REJECTED" | "REFUNDED";
  reason: string;
  filed_at: string;
  refund_deadline: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  FILED: "Filed",
  WITHIN_WINDOW: "Within return window",
  OUTSIDE_WINDOW: "Outside return window",
  CPA_OVERRIDE: "CPA override applied",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REFUNDED: "Refunded",
};

const STATUS_COLOR: Record<string, string> = {
  FILED: "bg-blue-100 text-blue-700",
  WITHIN_WINDOW: "bg-teal-100 text-teal-700",
  OUTSIDE_WINDOW: "bg-orange-100 text-orange-700",
  CPA_OVERRIDE: "bg-purple-100 text-purple-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-gray-100 text-gray-600",
  REFUNDED: "bg-emerald-100 text-emerald-700",
};

export default function CustomerReturnsPage() {
  const [items, setItems] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    apiFetch("/api/v1/customer/returns/")
      .then((d) => setItems(Array.isArray(d) ? d as ReturnRequest[] : ((d as { results?: ReturnRequest[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscriptionId || !reason.trim()) {
      setError("Please provide a subscription and reason.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/api/v1/customer/returns/", {
        method: "POST",
        body: JSON.stringify({ subscription: Number(subscriptionId), reason }),
      });
      setShowForm(false);
      setSubscriptionId("");
      setReason("");
      reload();
    } catch {
      setError("Could not submit return request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const kpis = [
    { label: "My requests", value: items.length },
    { label: "Active", value: items.filter((i) => ["FILED", "WITHIN_WINDOW", "APPROVED"].includes(i.status)).length },
    { label: "Refunded", value: items.filter((i) => i.status === "REFUNDED").length },
  ];

  return (
    <ERPPageShell
      title="My Return Requests"
      subtitle="Consumer Protection Act 2019 â€” 7-day return window for product defects"
      stats={kpis}
    >
      <div className="mb-4">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90"
        >
          {showForm ? "Cancel" : "+ File a return request"}
        </button>
      </div>

      {showForm && (
        <WorkspaceSection title="File a new return request">
          <form onSubmit={submit} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium mb-1">Subscription ID</label>
              <input
                type="number"
                value={subscriptionId}
                onChange={(e) => setSubscriptionId(e.target.value)}
                placeholder="Enter your subscription number"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reason for return</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe the defect or reason for returnâ€¦"
                rows={4}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={submitting}
                className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 disabled:opacity-50">
                {submitting ? "Submittingâ€¦" : "Submit request"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="text-sm border px-4 py-2 rounded hover:bg-muted">
                Cancel
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Returns must be filed within 7 days of delivery. We will review your request within 2 business days.
            </p>
          </form>
        </WorkspaceSection>
      )}

      <WorkspaceSection title="Your return history">
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loadingâ€¦</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">You have no return requests.</p>
        ) : (
          <div className="space-y-3">
            {items.map((r) => (
              <div key={r.id} className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">
                    Return request RR-{r.id}
                    {r.subscription_number && <span className="text-muted-foreground ml-2 font-normal">({r.subscription_number})</span>}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[r.status] ?? ""}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{r.reason}</p>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Filed: {new Date(r.filed_at).toLocaleDateString()}</span>
                  {r.refund_deadline && (
                    <span>Refund deadline: <strong>{r.refund_deadline}</strong></span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </WorkspaceSection>
    </ERPPageShell>
  );
}

