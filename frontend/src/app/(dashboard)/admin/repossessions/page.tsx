"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Repossession = {
  id: number;
  subscription: number;
  subscription_number?: string;
  customer_name?: string;
  status: "NOTICE_ISSUED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  notice_issued_at: string;
  notice_reference: string;
  response_deadline: string;
  initiated_at: string | null;
  completed_at: string | null;
  outstanding_balance_at_repossession: string | null;
  asset_condition_on_return: string;
};

const STATUS_COLOR: Record<string, string> = {
  NOTICE_ISSUED: "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export default function RepossessionsPage() {
  const [items, setItems] = useState<Repossession[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    apiFetch("/api/v1/admin/repossessions/")
      .then((d) => setItems(Array.isArray(d) ? d as Repossession[] : ((d as { results?: Repossession[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Notice issued", value: items.filter((i) => i.status === "NOTICE_ISSUED").length },
    { label: "In progress", value: items.filter((i) => i.status === "IN_PROGRESS").length },
    { label: "Completed", value: items.filter((i) => i.status === "COMPLETED").length },
  ];

  const advanceStatus = async (id: number, action: string) => {
    await apiFetch(`/api/v1/admin/repossessions/${id}/${action}/`, { method: "POST" });
    reload();
  };

  return (
    <ERPPageShell
      title="Repossessions"
      subtitle="CTRL-RENT-8 â€” Written-notice-first repossession workflow for rent/lease contracts"
      stats={kpis}
    >
      <WorkspaceSection title="Active repossession cases">
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loadingâ€¦</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No repossession cases on record.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Contract</th>
                  <th className="text-left py-2 px-3 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Notice ref</th>
                  <th className="text-left py-2 px-3 font-medium">Response deadline</th>
                  <th className="text-left py-2 px-3 font-medium">Outstanding</th>
                  <th className="text-left py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-mono text-xs">{r.subscription_number ?? `#${r.subscription}`}</td>
                    <td className="py-2 px-3">{r.customer_name ?? "â€”"}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[r.status] ?? ""}`}>
                        {r.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground text-xs">{r.notice_reference || "â€”"}</td>
                    <td className="py-2 px-3 text-xs">
                      <span className={new Date(r.response_deadline) < new Date() && r.status === "NOTICE_ISSUED" ? "text-red-600 font-medium" : ""}>
                        {r.response_deadline}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs font-mono">
                      {r.outstanding_balance_at_repossession ? `â‚¹${Number(r.outstanding_balance_at_repossession).toLocaleString("en-IN")}` : "â€”"}
                    </td>
                    <td className="py-2 px-3 flex gap-2">
                      {r.status === "NOTICE_ISSUED" && (
                        <button onClick={() => advanceStatus(r.id, "initiate")}
                          className="text-xs bg-orange-600 text-white px-2 py-1 rounded hover:bg-orange-700">
                          Initiate
                        </button>
                      )}
                      {r.status === "IN_PROGRESS" && (
                        <button onClick={() => advanceStatus(r.id, "complete")}
                          className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                          Mark complete
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

