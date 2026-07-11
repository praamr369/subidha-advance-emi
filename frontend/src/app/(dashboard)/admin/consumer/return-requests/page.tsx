"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type ReturnRequest = {
  id: number;
  subscription: number;
  subscription_number?: string;
  customer_name?: string;
  status: "FILED" | "WITHIN_WINDOW" | "OUTSIDE_WINDOW" | "CPA_OVERRIDE" | "APPROVED" | "REJECTED" | "REFUNDED";
  reason: string;
  defect_claim?: number | null;
  filed_at: string;
  refund_deadline: string | null;
  cpa_override_authorised_by?: string | null;
  created_at: string;
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

export default function ReturnRequestsPage() {
  const [items, setItems] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    apiFetch("/api/v1/admin/consumer/return-requests/")
      .then((d) => setItems(Array.isArray(d) ? d as ReturnRequest[] : ((d as { results?: ReturnRequest[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Filed", value: items.filter((i) => ["FILED", "WITHIN_WINDOW"].includes(i.status)).length },
    { label: "Outside window", value: items.filter((i) => i.status === "OUTSIDE_WINDOW").length },
    { label: "Refunded", value: items.filter((i) => i.status === "REFUNDED").length },
  ];

  const act = async (id: number, action: string) => {
    await apiFetch(`/api/v1/admin/consumer/return-requests/${id}/${action}/`, { method: "POST" });
    reload();
  };

  const overrideWithCPA = async (id: number) => {
    const reason = prompt("CPA override reason (authorised by?):");
    if (!reason) return;
    await apiFetch(`/api/v1/admin/consumer/return-requests/${id}/cpa-override/`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    reload();
  };

  return (
    <ERPPageShell
      title="Return Requests"
      subtitle="CTRL-CONS-3 â€” 7-day return window (Consumer Protection Act 2019 s.19)"
      stats={kpis}
    >
      <WorkspaceSection title="Customer return requests">
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loadingâ€¦</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No return requests on file.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Request</th>
                  <th className="text-left py-2 px-3 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Filed at</th>
                  <th className="text-left py-2 px-3 font-medium">Refund deadline</th>
                  <th className="text-left py-2 px-3 font-medium">Reason</th>
                  <th className="text-left py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-mono text-xs">RR-{r.id}</td>
                    <td className="py-2 px-3">{r.customer_name ?? "â€”"}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[r.status] ?? ""}`}>
                        {r.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{new Date(r.filed_at).toLocaleDateString()}</td>
                    <td className="py-2 px-3 text-xs">
                      {r.refund_deadline ? (
                        <span className={new Date(r.refund_deadline) < new Date() ? "text-red-600 font-medium" : ""}>
                          {r.refund_deadline}
                        </span>
                      ) : "â€”"}
                    </td>
                    <td className="py-2 px-3 text-xs max-w-[180px] truncate" title={r.reason}>{r.reason}</td>
                    <td className="py-2 px-3 flex gap-1">
                      {["FILED", "WITHIN_WINDOW"].includes(r.status) && (
                        <>
                          <button onClick={() => act(r.id, "approve")}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                            Approve
                          </button>
                          <button onClick={() => act(r.id, "reject")}
                            className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">
                            Reject
                          </button>
                        </>
                      )}
                      {r.status === "OUTSIDE_WINDOW" && (
                        <button onClick={() => overrideWithCPA(r.id)}
                          className="text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700">
                          CPA override
                        </button>
                      )}
                      {r.status === "APPROVED" && (
                        <button onClick={() => act(r.id, "mark-refunded")}
                          className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700">
                          Mark refunded
                        </button>
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

