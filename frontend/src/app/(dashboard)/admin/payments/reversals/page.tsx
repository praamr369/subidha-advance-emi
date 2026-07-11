"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Reversal = {
  id: number;
  payment_id: number;
  receipt_number: string;
  amount: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PROCESSED";
  requested_by: string;
  approved_by: string | null;
  created_at: string;
  processed_at: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-blue-100 text-blue-700",
  PROCESSED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default function PaymentReversalsPage() {
  const [reversals, setReversals] = useState<Reversal[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);

  useEffect(() => {
    apiFetch("/api/v1/payments/reversals/")
      .then((d) => setReversals(Array.isArray(d) ? d as Reversal[] : ((d as { results?: Reversal[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [processing]);

  const handleAction = async (id: number, action: "approve" | "reject") => {
    setProcessing(id);
    try {
      await apiFetch(`/api/v1/payments/reversals/${id}/${action}/`, { method: "POST" });
      setReversals((prev) =>
        prev.map((r) => r.id === id ? { ...r, status: action === "approve" ? "APPROVED" : "REJECTED" } : r)
      );
    } catch {
      // silent
    } finally {
      setProcessing(null);
    }
  };

  const pending = reversals.filter((r) => r.status === "PENDING");

  return (
    <ERPPageShell
      title="Payment Reversals & Receipt Voids"
      subtitle="Review and process payment reversal requests"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Payments", href: "/admin/payments" },
        { label: "Reversals" },
      ]}
    >
      <div className="space-y-6">
        {!loading && (
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Pending", count: pending.length, color: "yellow" },
              { label: "Approved", count: reversals.filter((r) => r.status === "APPROVED").length, color: "blue" },
              { label: "Processed", count: reversals.filter((r) => r.status === "PROCESSED").length, color: "green" },
              { label: "Total", count: reversals.length, color: "gray" },
            ].map((s) => (
              <div key={s.label} className="p-4 border rounded-xl">
                <div className="text-2xl font-bold">{s.count}</div>
                <div className="text-xs text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <WorkspaceSection title="Reversal Requests">
          {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}

          {!loading && reversals.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-medium">No reversal requests</p>
            </div>
          )}

          {!loading && reversals.map((r) => (
            <div key={r.id} className="p-4 border rounded-lg mb-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">Receipt: {r.receipt_number}</div>
                  <div className="text-sm text-gray-500">Payment #{r.payment_id} · ₹{r.amount.toLocaleString("en-IN")}</div>
                  <div className="text-sm text-gray-600 mt-1">{r.reason}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status] || "bg-gray-100 text-gray-600"}`}>
                  {r.status}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span>By: {r.requested_by}</span>
                <span>{new Date(r.created_at).toLocaleDateString("en-IN")}</span>
                {r.approved_by && <span>Approved by: {r.approved_by}</span>}
              </div>
              {r.status === "PENDING" && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleAction(r.id, "approve")}
                    disabled={processing === r.id}
                    className="flex-1 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(r.id, "reject")}
                    disabled={processing === r.id}
                    className="flex-1 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
