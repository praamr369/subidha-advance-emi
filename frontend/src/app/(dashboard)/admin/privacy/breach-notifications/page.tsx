"use client";

import { useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import RefreshBar from "@/components/feedback/RefreshBar";
import { WorkspaceSection } from "@/components/ui/workspace";
import { useRefreshableList } from "@/hooks/useRefreshableList";
import { apiFetch } from "@/lib/api";

type BreachNotification = {
  id: number;
  breach_reference: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "IDENTIFIED" | "INVESTIGATING" | "NOTIFIED_BOARD" | "NOTIFIED_PRINCIPALS" | "CLOSED";
  detected_at: string;
  description: string;
  data_categories_affected: string[];
  estimated_principals_affected: number;
  board_notified_at: string | null;
  principals_notified_at: string | null;
  reported_by_name?: string;
  closed_at: string | null;
  containment_measures: string;
};

const SEVERITY_COLOR: Record<string, string> = {
  LOW: "bg-blue-100 text-blue-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const STATUS_COLOR: Record<string, string> = {
  IDENTIFIED: "bg-red-100 text-red-700",
  INVESTIGATING: "bg-orange-100 text-orange-700",
  NOTIFIED_BOARD: "bg-yellow-100 text-yellow-700",
  NOTIFIED_PRINCIPALS: "bg-blue-100 text-blue-700",
  CLOSED: "bg-green-100 text-green-700",
};

const ACTION_NEXT: Record<string, string> = {
  investigate: "INVESTIGATING",
  "notify-board": "NOTIFIED_BOARD",
  "notify-principals": "NOTIFIED_PRINCIPALS",
  close: "CLOSED",
};

async function fetchBreaches(): Promise<BreachNotification[]> {
  const d = await apiFetch("/api/v1/admin/privacy/breach-notifications/");
  return Array.isArray(d) ? (d as BreachNotification[]) : ((d as { results?: BreachNotification[] })?.results ?? []);
}

export default function BreachNotificationsPage() {
  const { items, setItems, initialLoading, refreshing, reload } =
    useRefreshableList<BreachNotification>(fetchBreaches);
  const [showForm, setShowForm] = useState(false);
  const [newBreach, setNewBreach] = useState({ description: "", severity: "MEDIUM", data_categories: "" });
  const [submitting, setSubmitting] = useState(false);

  const open = items.filter((i) => !["CLOSED"].includes(i.status)).length;
  const critical = items.filter((i) => i.severity === "CRITICAL" && i.status !== "CLOSED").length;

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Open", value: open },
    { label: "Critical open", value: critical },
    { label: "Closed", value: items.filter((i) => i.status === "CLOSED").length },
  ];

  const advance = async (id: number, action: string, body?: object) => {
    const next = ACTION_NEXT[action];
    if (next) setItems((prev) => prev.map((b) => (b.id === id ? { ...b, status: next as BreachNotification["status"] } : b)));
    await apiFetch(`/api/v1/admin/privacy/breach-notifications/${id}/${action}/`, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    reload();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/admin/privacy/breach-notifications/", {
        method: "POST",
        body: JSON.stringify({
          description: newBreach.description,
          severity: newBreach.severity,
          data_categories_affected: newBreach.data_categories.split(",").map((s) => s.trim()).filter(Boolean),
          detected_at: new Date().toISOString(),
        }),
      });
      setShowForm(false);
      setNewBreach({ description: "", severity: "MEDIUM", data_categories: "" });
      reload();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ERPPageShell
      title="Breach Notifications"
      subtitle="CTRL-DPDP-5 — DPDP 2023 s.8 breach notification to Data Protection Board and affected principals"
      stats={kpis}
    >
      {critical > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          {critical} CRITICAL breach{critical > 1 ? "es" : ""} require immediate action — notify the Data Protection Board as soon as possible (DPDP 2023 s.8).
        </div>
      )}

      <div className="mb-4">
        <button onClick={() => setShowForm((v) => !v)}
          className="text-sm bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
          {showForm ? "Cancel" : "+ Report new breach"}
        </button>
      </div>

      {showForm && (
        <WorkspaceSection title="Report a data breach">
          <form onSubmit={submit} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium mb-1">Severity</label>
              <select value={newBreach.severity}
                onChange={(e) => setNewBreach((v) => ({ ...v, severity: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea value={newBreach.description}
                onChange={(e) => setNewBreach((v) => ({ ...v, description: e.target.value }))}
                rows={4} required
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                placeholder="Describe the breach — what happened, how it was discovered…" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data categories affected (comma-separated)</label>
              <input value={newBreach.data_categories}
                onChange={(e) => setNewBreach((v) => ({ ...v, data_categories: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. email, phone, aadhaar, payment" />
            </div>
            <button type="submit" disabled={submitting}
              className="text-sm bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50">
              {submitting ? "Reporting…" : "Report breach"}
            </button>
          </form>
        </WorkspaceSection>
      )}

      <WorkspaceSection title="Breach incident register">
        <RefreshBar active={refreshing} />
        {initialLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No breach notifications on record.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Reference</th>
                  <th className="text-left py-2 px-3 font-medium">Severity</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Detected</th>
                  <th className="text-left py-2 px-3 font-medium">Principals affected</th>
                  <th className="text-left py-2 px-3 font-medium">Board notified</th>
                  <th className="text-left py-2 px-3 font-medium">Principals notified</th>
                  <th className="text-left py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id} className={`border-b hover:bg-muted/30 ${b.severity === "CRITICAL" && b.status !== "CLOSED" ? "bg-red-50/20" : ""}`}>
                    <td className="py-2 px-3 font-mono text-xs">{b.breach_reference}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLOR[b.severity] ?? ""}`}>
                        {b.severity}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[b.status] ?? ""}`}>
                        {b.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">
                      {new Date(b.detected_at).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-center text-xs font-medium">
                      {b.estimated_principals_affected.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-xs">
                      {b.board_notified_at ? (
                        <span className="text-green-600">{new Date(b.board_notified_at).toLocaleDateString()}</span>
                      ) : (
                        <span className="text-red-600 font-medium">Not yet</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-xs">
                      {b.principals_notified_at ? (
                        <span className="text-green-600">{new Date(b.principals_notified_at).toLocaleDateString()}</span>
                      ) : "—"}
                    </td>
                    <td className="py-2 px-3 flex gap-1 flex-wrap">
                      {b.status === "IDENTIFIED" && (
                        <button onClick={() => advance(b.id, "investigate")}
                          className="text-xs bg-orange-600 text-white px-2 py-1 rounded hover:bg-orange-700">
                          Investigate
                        </button>
                      )}
                      {["IDENTIFIED", "INVESTIGATING"].includes(b.status) && !b.board_notified_at && (
                        <button onClick={() => advance(b.id, "notify-board")}
                          className="text-xs bg-yellow-600 text-white px-2 py-1 rounded hover:bg-yellow-700">
                          Notify Board
                        </button>
                      )}
                      {b.status === "NOTIFIED_BOARD" && !b.principals_notified_at && (
                        <button onClick={async () => {
                          const count = prompt("Estimated principals affected:");
                          if (count) advance(b.id, "notify-principals", { estimated_principals_affected: Number(count) });
                        }}
                          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">
                          Notify Principals
                        </button>
                      )}
                      {b.status === "NOTIFIED_PRINCIPALS" && (
                        <button onClick={() => advance(b.id, "close")}
                          className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                          Close
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
