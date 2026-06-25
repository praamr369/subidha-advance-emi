"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { getCashSessions, type CashCounterSession } from "@/services/control-enterprise";

export default function AdminControlCashSessionsPage() {
  const [rows, setRows] = useState<CashCounterSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await getCashSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cash sessions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <ERPPageShell
      eyebrow="Enterprise Control"
      title="Cash Counter Sessions"
      subtitle="Open and closed cash counter sessions with declared cash and variance."
      breadcrumbs={[
        { href: ROUTES.admin.dashboard, label: "Admin" },
        { href: ROUTES.admin.controlRoot, label: "Control Desk" },
        { label: "Cash Sessions" },
      ]}
    >
      {loading && <LoadingBlock />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState title="No sessions" description="No cash counter sessions found." />
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Counter</th>
                <th className="px-4 py-3">Opened By</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Opening Cash</th>
                <th className="px-4 py-3">Declared Cash</th>
                <th className="px-4 py-3">Variance</th>
                <th className="px-4 py-3">Opened At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const variance = row.variance ? parseFloat(row.variance) : null;
                return (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.id}</td>
                    <td className="px-4 py-3">{row.counter_name}</td>
                    <td className="px-4 py-3">{row.opened_by_username}</td>
                    <td className="px-4 py-3">
                      <span className={row.status === "OPEN" ? "text-blue-600 font-semibold" : "text-muted-foreground"}>
                        {row.status === "OPEN" ? "Open" : "Closed"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">₹{row.opening_cash}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.declared_cash != null ? `₹${row.declared_cash}` : "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {variance != null ? (
                        <span className={variance !== 0 ? "text-destructive font-semibold" : "text-green-600"}>
                          ₹{row.variance}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(row.opened_at).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ERPPageShell>
  );
}
