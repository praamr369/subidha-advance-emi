"use client";

import RefreshBar from "@/components/feedback/RefreshBar";
import { WorkspaceSection } from "@/components/ui/workspace";
import { useRefreshableList } from "@/hooks/useRefreshableList";
import { apiFetch } from "@/lib/api";

type SignOff = {
  id: number;
  reconciliation_run: number;
  run_period?: string;
  status: "PENDING" | "SIGNED_OFF" | "REVOKED";
  signed_off_by_name?: string;
  signed_off_at: string | null;
  open_item_count_at_sign_off: number;
  revoked_by_name?: string;
  revoked_at: string | null;
  revocation_reason: string;
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  SIGNED_OFF: "bg-green-100 text-green-700",
  REVOKED: "bg-red-100 text-red-700",
};

async function fetchSignoffs(): Promise<SignOff[]> {
  const d = await apiFetch("/api/v1/admin/finance/reconciliation-signoffs/");
  return Array.isArray(d) ? (d as SignOff[]) : ((d as { results?: SignOff[] })?.results ?? []);
}

/**
 * Officer sign-off gate for reconciliation runs (zero open items required before
 * sign-off). Extracted from /admin/finance/reconciliation-signoffs so it renders
 * both on that route and as a tab in the Reconciliation Center.
 */
export default function ReconciliationSignoffsPanel() {
  const { items, initialLoading, refreshing, reload } = useRefreshableList<SignOff>(fetchSignoffs);

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Pending", value: items.filter((i) => i.status === "PENDING").length },
    { label: "Signed off", value: items.filter((i) => i.status === "SIGNED_OFF").length },
    { label: "Revoked", value: items.filter((i) => i.status === "REVOKED").length },
  ];

  const signOff = async (id: number) => {
    await apiFetch(`/api/v1/admin/finance/reconciliation-signoffs/${id}/sign-off/`, { method: "POST" });
    reload();
  };

  const revoke = async (id: number) => {
    const reason = prompt("Revocation reason:");
    if (!reason) return;
    await apiFetch(`/api/v1/admin/finance/reconciliation-signoffs/${id}/revoke/`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    reload();
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        CTRL-FIN-5 — Officer sign-off gate: zero open items required before sign-off.
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border p-4">
            <div className="text-2xl font-bold tabular-nums">{k.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      <WorkspaceSection title="Sign-off records">
        <RefreshBar active={refreshing} />
        {initialLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No sign-off records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Run</th>
                  <th className="text-left py-2 px-3 font-medium">Period</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Open items</th>
                  <th className="text-left py-2 px-3 font-medium">Signed off by</th>
                  <th className="text-left py-2 px-3 font-medium">Signed off at</th>
                  <th className="text-left py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-mono text-xs">#{s.reconciliation_run}</td>
                    <td className="py-2 px-3 text-xs">{s.run_period ?? "—"}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[s.status] ?? ""}`}>
                        {s.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={s.open_item_count_at_sign_off > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                        {s.open_item_count_at_sign_off}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs">{s.signed_off_by_name ?? "—"}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">
                      {s.signed_off_at ? new Date(s.signed_off_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 px-3 flex gap-1">
                      {s.status === "PENDING" && (
                        <button onClick={() => signOff(s.id)}
                          className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                          Sign off
                        </button>
                      )}
                      {s.status === "SIGNED_OFF" && (
                        <button onClick={() => revoke(s.id)}
                          className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">
                          Revoke
                        </button>
                      )}
                      {s.status === "REVOKED" && s.revocation_reason && (
                        <span className="text-xs text-muted-foreground italic">{s.revocation_reason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkspaceSection>
    </div>
  );
}
