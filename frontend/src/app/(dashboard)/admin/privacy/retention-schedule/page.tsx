"use client";

import ERPPageShell from "@/components/erp/ERPPageShell";
import RefreshBar from "@/components/feedback/RefreshBar";
import { WorkspaceSection } from "@/components/ui/workspace";
import { useRefreshableList } from "@/hooks/useRefreshableList";
import { apiFetch } from "@/lib/api";

type RetentionSchedule = {
  id: number;
  schedule_reference: string;
  data_category: string;
  status: "SCHEDULED" | "AWAITING_APPROVAL" | "APPROVED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  scheduled_purge_date: string;
  records_targeted: number;
  records_purged: number;
  retention_policy_reference: string;
  approved_by_name?: string | null;
  approved_at: string | null;
  completed_at: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  AWAITING_APPROVAL: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-teal-100 text-teal-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

async function fetchSchedule(): Promise<RetentionSchedule[]> {
  const d = await apiFetch("/api/v1/admin/privacy/retention-schedule/");
  return Array.isArray(d) ? (d as RetentionSchedule[]) : ((d as { results?: RetentionSchedule[] })?.results ?? []);
}

export default function RetentionSchedulePage() {
  const { items, setItems, initialLoading, refreshing, reload } =
    useRefreshableList<RetentionSchedule>(fetchSchedule);

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Awaiting approval", value: items.filter((i) => i.status === "AWAITING_APPROVAL").length },
    { label: "Approved", value: items.filter((i) => i.status === "APPROVED").length },
    { label: "Completed", value: items.filter((i) => i.status === "COMPLETED").length },
  ];

  const act = async (id: number, action: string) => {
    const nextMap: Record<string, string> = { approve: "APPROVED", cancel: "CANCELLED", execute: "IN_PROGRESS" };
    const next = nextMap[action];
    if (next) setItems((prev) => prev.map((s) => (s.id === id ? { ...s, status: next as RetentionSchedule["status"] } : s)));
    await apiFetch(`/api/v1/admin/privacy/retention-schedule/${id}/${action}/`, { method: "POST" });
    reload();
  };

  return (
    <ERPPageShell
      title="Data Retention Schedule"
      subtitle="CTRL-DPDP-8 — Purge job approvals; AWAITING_APPROVAL gate before execution"
      stats={kpis}
    >
      <WorkspaceSection title="Scheduled purge jobs">
        <RefreshBar active={refreshing} />
        {initialLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No retention schedule entries.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Reference</th>
                  <th className="text-left py-2 px-3 font-medium">Data category</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Purge date</th>
                  <th className="text-left py-2 px-3 font-medium">Records targeted</th>
                  <th className="text-left py-2 px-3 font-medium">Records purged</th>
                  <th className="text-left py-2 px-3 font-medium">Approved by</th>
                  <th className="text-left py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-mono text-xs">{s.schedule_reference}</td>
                    <td className="py-2 px-3 text-xs">{s.data_category}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[s.status] ?? ""}`}>
                        {s.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs">
                      <span className={new Date(s.scheduled_purge_date) < new Date() && !["COMPLETED", "CANCELLED"].includes(s.status) ? "text-red-600 font-medium" : "text-muted-foreground"}>
                        {s.scheduled_purge_date}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center text-xs">{s.records_targeted.toLocaleString()}</td>
                    <td className="py-2 px-3 text-center text-xs">
                      {s.status === "COMPLETED" ? (
                        <span className="text-green-600 font-medium">{s.records_purged.toLocaleString()}</span>
                      ) : "—"}
                    </td>
                    <td className="py-2 px-3 text-xs">{s.approved_by_name ?? "—"}</td>
                    <td className="py-2 px-3 flex gap-1">
                      {s.status === "AWAITING_APPROVAL" && (
                        <>
                          <button onClick={() => act(s.id, "approve")}
                            className="text-xs bg-teal-600 text-white px-2 py-1 rounded hover:bg-teal-700">
                            Approve
                          </button>
                          <button onClick={() => act(s.id, "cancel")}
                            className="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700">
                            Cancel
                          </button>
                        </>
                      )}
                      {s.status === "APPROVED" && (
                        <button onClick={() => act(s.id, "execute")}
                          className="text-xs bg-orange-600 text-white px-2 py-1 rounded hover:bg-orange-700">
                          Execute
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
