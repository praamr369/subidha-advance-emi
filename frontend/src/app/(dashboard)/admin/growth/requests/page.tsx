"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

type GrowthRequest = {
  id: number;
  request_number: string;
  customer_id: number;
  request_type: string;
  status: string;
  priority: string;
  approval_required: boolean;
  reason: string;
  created_at: string;
};

function statusBadge(s: string) {
  if (s === "APPROVED") return "bg-green-100 text-green-800 border border-green-200";
  if (s === "SUBMITTED" || s === "UNDER_REVIEW") return "bg-blue-100 text-blue-700 border border-blue-200";
  if (s === "DRAFT") return "bg-amber-100 text-amber-700 border border-amber-200";
  if (s === "REJECTED" || s === "CANCELLED") return "bg-red-100 text-red-700 border border-red-200";
  if (s === "CONVERTED") return "bg-purple-100 text-purple-700 border border-purple-200";
  return "bg-muted text-muted-foreground border border-border";
}

function priorityBadge(p: string) {
  if (p === "URGENT") return "bg-red-100 text-red-700 border border-red-200";
  if (p === "HIGH") return "bg-orange-100 text-orange-700 border border-orange-200";
  if (p === "NORMAL") return "bg-blue-50 text-blue-700 border border-blue-100";
  return "bg-muted text-muted-foreground border border-border";
}

export default function GrowthRequestsPage() {
  const [requests, setRequests] = useState<GrowthRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ results: GrowthRequest[] }>("/admin/growth/requests/")
      .then((r) => setRequests(r.results))
      .catch((e) => setError(e?.message ?? "Failed to load growth requests."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ERPLoadingState />;
  if (error) return <ERPErrorState message={error} />;

  return (
    <ERPPageShell
      title="Growth Requests"
      subtitle="Customer renewal, upgrade, exchange, and plan conversion requests. Request workflow only — no subscription is created automatically."
      actions={[{ href: ROUTES.admin.growth, label: "Growth Hub", variant: "secondary" }]}
    >
      {requests.length === 0 ? (
        <ERPEmptyState title="No growth requests" description="No customer growth requests have been submitted yet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Request #</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Priority</th>
                <th className="px-4 py-3 text-left font-medium">Approval Req.</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{r.request_number}</td>
                  <td className="px-4 py-3 text-xs">{r.customer_id}</td>
                  <td className="px-4 py-3 text-xs">{r.request_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${priorityBadge(r.priority)}`}>
                      {r.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.approval_required ? "Yes" : "No"}</td>
                  <td className="px-4 py-3 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ERPPageShell>
  );
}
