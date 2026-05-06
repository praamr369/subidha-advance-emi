"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch } from "@/lib/api";
import { ROUTES } from "@/lib/routes";

type QueueRow = {
  id: number;
  case_no: string;
  source_reference: string;
  status: string;
};

export default function ReversalReconciliationPage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiFetch<{ results: QueueRow[] }>("/admin/finance/reversal-reconciliation/")
      .then((payload) => {
        if (!active) return;
        setRows(payload.results || []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load reversal reconciliation queue");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PortalPage
      title="Reversal Reconciliation"
      subtitle="Unresolved reversal/refund/return links waiting for full reconciliation."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.root },
        { label: "Finance", href: ROUTES.admin.finance },
        { label: "Reversal Reconciliation" },
      ]}
    >
      {loading ? <LoadingBlock label="Loading reconciliation queue..." /> : null}
      {!loading && error ? <ErrorState title="Unable to load queue" description={error} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="Queue is clear" description="No open reversal reconciliation rows are pending." />
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <div className="overflow-hidden rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">Case</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{row.case_no}</td>
                  <td className="px-3 py-2">{row.source_reference || "—"}</td>
                  <td className="px-3 py-2">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </PortalPage>
  );
}
