"use client";

import { useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import RefreshBar from "@/components/feedback/RefreshBar";
import { WorkspaceSection } from "@/components/ui/workspace";
import { useRefreshableList } from "@/hooks/useRefreshableList";
import { luckyPlanService, type DrawAuthorisation as DrawAuth } from "@/services/lucky-plan";

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  AUTHORISED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  REVOKED: "bg-gray-100 text-gray-600",
};

const ACTION_NEXT: Record<string, string> = { authorise: "AUTHORISED", reject: "REJECTED" };

export default function DrawAuthorisationsPage() {
  const { items, setItems, initialLoading, refreshing, reload } =
    useRefreshableList<DrawAuth>(() => luckyPlanService.getDrawAuthorisations());
  const [acting, setActing] = useState<number | null>(null);

  const act = async (id: number, action: "authorise" | "reject", reason?: string) => {
    setActing(id);
    const next = ACTION_NEXT[action];
    if (next) setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: next as DrawAuth["status"] } : i)));
    try {
      await luckyPlanService.actOnDrawAuthorisation(id, action, reason);
      reload();
    } catch {
    } finally {
      setActing(null);
    }
  };

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Pending", value: items.filter((i) => i.status === "PENDING").length },
    { label: "Authorised", value: items.filter((i) => i.status === "AUTHORISED").length },
    { label: "Rejected", value: items.filter((i) => i.status === "REJECTED").length },
  ];

  return (
    <ERPPageShell
      title="Draw Authorisations"
      subtitle="CTRL-LP-1 — Pre-draw officer sign-off required before seed commitment"
      stats={kpis}
    >
      <WorkspaceSection title="Authorisation requests">
        <RefreshBar active={refreshing} />
        {initialLoading ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No draw authorisation requests found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Batch</th>
                  <th className="text-left py-2 px-3 font-medium">Month</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Requested by</th>
                  <th className="text-left py-2 px-3 font-medium">Authorised at</th>
                  <th className="text-left py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-mono">{item.batch_code ?? `#${item.batch}`}</td>
                    <td className="py-2 px-3">{item.draw_month}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[item.status] ?? ""}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2 px-3">{item.requested_by_name ?? "—"}</td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {item.authorised_at ? new Date(item.authorised_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 px-3 flex gap-2">
                      {item.status === "PENDING" && (
                        <>
                          <button
                            disabled={acting === item.id}
                            onClick={() => act(item.id, "authorise")}
                            className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            Authorise
                          </button>
                          <button
                            disabled={acting === item.id}
                            onClick={() => {
                              const reason = prompt("Rejection reason:");
                              if (reason) act(item.id, "reject", reason);
                            }}
                            className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {item.rejection_reason && (
                        <span className="text-xs text-muted-foreground italic truncate max-w-[200px]" title={item.rejection_reason}>
                          {item.rejection_reason}
                        </span>
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
