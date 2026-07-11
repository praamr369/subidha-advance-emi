"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type RefundCase = {
  id: number;
  customer_name: string;
  product_name: string;
  subscription_number: string;
  reason: string;
  status: string;
  refund_amount: number;
  deduction_amount: number;
  created_at: string;
  sla_deadline: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  REQUESTED: "bg-yellow-100 text-yellow-700",
  UNDER_REVIEW: "bg-blue-100 text-blue-700",
  PICKUP_SCHEDULED: "bg-purple-100 text-purple-700",
  ITEM_RECEIVED: "bg-orange-100 text-orange-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default function RefundProcessPage() {
  const [cases, setCases] = useState<RefundCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");

  useEffect(() => {
    const qs = statusFilter === "PENDING"
      ? "status=REQUESTED,UNDER_REVIEW,ITEM_RECEIVED,PROCESSING"
      : `status=${statusFilter}`;
    apiFetch(`/api/v1/refunds/admin-list/?${qs}`)
      .then((d) => setCases(Array.isArray(d) ? d as RefundCase[] : ((d as { results?: RefundCase[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const handleAdvance = async (id: number) => {
    try {
      await apiFetch(`/api/v1/refunds/${id}/advance/`, { method: "POST" });
      setCases((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // silent
    }
  };

  return (
    <ERPPageShell
      title="Refund Processing"
      subtitle="Manage return and refund workflows — SLA: 2–14 days (CPA 2019)"
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Refunds" }]}
    >
      <div className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          {["PENDING", "COMPLETED", "REJECTED"].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setLoading(true); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === s ? "bg-blue-600 text-white" : "border hover:bg-gray-50 dark:hover:bg-gray-800"}`}
            >
              {s}
            </button>
          ))}
        </div>

        <WorkspaceSection title={`${cases.length} Case${cases.length !== 1 ? "s" : ""}`}>
          {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}
          {!loading && cases.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-medium">No cases in this status</p>
            </div>
          )}
          {cases.map((c) => {
            const isOverdue = c.sla_deadline && new Date(c.sla_deadline) < new Date();
            return (
              <div key={c.id} className={`p-4 border rounded-lg mb-3 ${isOverdue ? "border-red-300" : ""}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">#{c.id} — {c.product_name}</div>
                    <div className="text-sm text-gray-500">{c.customer_name} · {c.subscription_number}</div>
                    <div className="text-sm text-gray-600 mt-1">{c.reason?.replace(/_/g, " ")}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[c.status] || "bg-gray-100 text-gray-600"}`}>
                    {c.status?.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>{new Date(c.created_at).toLocaleDateString("en-IN")}</span>
                  {c.refund_amount > 0 && <span className="text-green-600">Refund: ₹{c.refund_amount.toLocaleString("en-IN")}</span>}
                  {c.deduction_amount > 0 && <span className="text-orange-600">Deduction: ₹{c.deduction_amount.toLocaleString("en-IN")}</span>}
                  {c.sla_deadline && (
                    <span className={isOverdue ? "text-red-600 font-bold" : ""}>
                      SLA: {new Date(c.sla_deadline).toLocaleDateString("en-IN")} {isOverdue && "⚠️ OVERDUE"}
                    </span>
                  )}
                </div>
                {!["COMPLETED", "REJECTED"].includes(c.status) && (
                  <div className="flex gap-2 mt-3">
                    <Link href={`/admin/refunds/inspection?refund=${c.id}`}
                      className="px-3 py-1.5 border rounded-lg text-xs hover:bg-gray-50">
                      Inspect
                    </Link>
                    <button onClick={() => handleAdvance(c.id)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                      Advance Status →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
