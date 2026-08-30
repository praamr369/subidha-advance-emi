"use client";

import ERPPageShell from "@/components/erp/ERPPageShell";
import RefreshBar from "@/components/feedback/RefreshBar";
import { WorkspaceSection } from "@/components/ui/workspace";
import { useRefreshableList } from "@/hooks/useRefreshableList";
import {
  advanceRepossession,
  listRepossessions,
  type Repossession,
} from "@/services/consumer";

const STATUS_COLOR: Record<string, string> = {
  NOTICE_ISSUED: "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export default function RepossessionsPage() {
  const { items, setItems, initialLoading, refreshing, reload } =
    useRefreshableList<Repossession>(listRepossessions);

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Notice issued", value: items.filter((i) => i.status === "NOTICE_ISSUED").length },
    { label: "In progress", value: items.filter((i) => i.status === "IN_PROGRESS").length },
    { label: "Completed", value: items.filter((i) => i.status === "COMPLETED").length },
  ];

  const advanceStatus = async (id: number, action: string) => {
    // Optimistic: update status locally so the row changes instantly without a scroll reset.
    const nextStatus = action === "initiate" ? "IN_PROGRESS" : "COMPLETED";
    setItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r))
    );
    await advanceRepossession(id, action);
    reload();
  };

  return (
    <ERPPageShell
      title="Repossessions"
      subtitle="CTRL-RENT-8 â€” Written-notice-first repossession workflow for rent/lease contracts"
      stats={kpis}
    >
      <WorkspaceSection title="Active repossession cases">
        <RefreshBar active={refreshing} />
        {initialLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
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

