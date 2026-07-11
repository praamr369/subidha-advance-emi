"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type ErasureRequest = {
  id: number;
  customer_name?: string;
  request_reference: string;
  status: "RECEIVED" | "UNDER_REVIEW" | "PARTIALLY_COMPLETED" | "COMPLETED" | "REJECTED";
  due_date: string;
  fields_to_erase: string[];
  fields_retained: string[];
  reviewed_by_name?: string | null;
  completed_at: string | null;
  rejection_reason: string;
  is_overdue: boolean;
};

const STATUS_COLOR: Record<string, string> = {
  RECEIVED: "bg-blue-100 text-blue-700",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-700",
  PARTIALLY_COMPLETED: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-green-100 text-green-700",
  REJECTED: "bg-gray-100 text-gray-500",
};

export default function ErasureRequestsPage() {
  const [items, setItems] = useState<ErasureRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    apiFetch("/api/v1/admin/privacy/erasure-requests/")
      .then((d) => setItems(Array.isArray(d) ? d as ErasureRequest[] : ((d as { results?: ErasureRequest[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const overdue = items.filter((i) => i.is_overdue).length;

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Received", value: items.filter((i) => i.status === "RECEIVED").length },
    { label: "Under review", value: items.filter((i) => i.status === "UNDER_REVIEW").length },
    { label: "Overdue", value: overdue },
  ];

  const advance = async (id: number, action: string, body?: object) => {
    await apiFetch(`/api/v1/admin/privacy/erasure-requests/${id}/${action}/`, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    reload();
  };

  return (
    <ERPPageShell
      title="Erasure Requests"
      subtitle="CTRL-DPDP-3 â€” DPDP 2023 s.12 right of erasure / correction (30-day SLA)"
      stats={kpis}
    >
      {overdue > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {overdue} request{overdue > 1 ? "s are" : " is"} past the 30-day statutory deadline (DPDP 2023 s.12).
        </div>
      )}
      <WorkspaceSection title="Erasure / correction requests">
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loadingâ€¦</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No erasure requests on file.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Reference</th>
                  <th className="text-left py-2 px-3 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Due date</th>
                  <th className="text-left py-2 px-3 font-medium">Fields to erase</th>
                  <th className="text-left py-2 px-3 font-medium">Fields retained</th>
                  <th className="text-left py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className={`border-b hover:bg-muted/30 ${r.is_overdue ? "bg-red-50/30" : ""}`}>
                    <td className="py-2 px-3 font-mono text-xs">{r.request_reference}</td>
                    <td className="py-2 px-3">{r.customer_name ?? "â€”"}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[r.status] ?? ""}`}>
                        {r.status.replace(/_/g, " ")}
                      </span>
                      {r.is_overdue && <span className="ml-1 text-xs text-red-600 font-medium">OVERDUE</span>}
                    </td>
                    <td className="py-2 px-3 text-xs">
                      <span className={r.is_overdue ? "text-red-600 font-medium" : "text-muted-foreground"}>
                        {r.due_date}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">
                      {r.fields_to_erase.join(", ") || "â€”"}
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">
                      {r.fields_retained.join(", ") || "â€”"}
                    </td>
                    <td className="py-2 px-3 flex gap-1">
                      {r.status === "RECEIVED" && (
                        <button onClick={() => advance(r.id, "review")}
                          className="text-xs bg-yellow-600 text-white px-2 py-1 rounded hover:bg-yellow-700">
                          Review
                        </button>
                      )}
                      {r.status === "UNDER_REVIEW" && (
                        <>
                          <button onClick={() => advance(r.id, "complete")}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                            Complete
                          </button>
                          <button onClick={async () => {
                            const reason = prompt("Rejection reason:");
                            if (reason) advance(r.id, "reject", { reason });
                          }}
                            className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkspaceSection>
    </ERPPageShell>
  );
}

