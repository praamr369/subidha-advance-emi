"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  listReconciliationSignOffs,
  revokeReconciliationSignOff,
  signOffReconciliation,
  type ReconciliationSignOff,
} from "@/services/finance-gaps";

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  SIGNED_OFF: "bg-green-100 text-green-700",
  REVOKED: "bg-red-100 text-red-700",
};

export default function ReconciliationSignOffsPage() {
  const [items, setItems] = useState<ReconciliationSignOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listReconciliationSignOffs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sign-off records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Pending", value: items.filter((i) => i.status === "PENDING").length },
    { label: "Signed off", value: items.filter((i) => i.status === "SIGNED_OFF").length },
    { label: "Revoked", value: items.filter((i) => i.status === "REVOKED").length },
  ];

  const signOff = async (id: number) => {
    try {
      await signOffReconciliation(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign off.");
    }
  };

  const revoke = async (id: number) => {
    const reason = prompt("Revocation reason:");
    if (!reason) return;
    try {
      await revokeReconciliationSignOff(id, reason);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke sign-off.");
    }
  };

  return (
    <ERPPageShell
      title="Reconciliation Sign-offs"
      subtitle="CTRL-FIN-5 — Officer sign-off gate: zero open items required before sign-off"
      stats={kpis}
    >
      <WorkspaceSection title="Sign-off records">
        {loading ? (
          <LoadingBlock label="Loading sign-off records…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="No sign-off records"
            description="Reconciliation sign-off records will appear here once reconciliation runs are created."
          />
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
                    <td className="py-2 px-3 font-mono text-xs">#{s.reconciliation_run_id}</td>
                    <td className="py-2 px-3 text-xs">{s.created_at ? new Date(s.created_at).toLocaleDateString("en-IN") : "—"}</td>
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
                    <td className="py-2 px-3 text-xs">{s.signed_off_by ?? "—"}</td>
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
    </ERPPageShell>
  );
}

