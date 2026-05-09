"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { fetchReversalReconciliationQueue, reconcileReversalCase, syncReversalCase } from "@/services/reversal-control";

export default function ReversalReconciliationPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchReversalReconciliationQueue()
      .then((payload) => {
        if (!active) return;
        setRows(payload.results || []);
        setSummary(payload.summary || {});
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
      {!loading && !error ? (
        <div className="mb-4 grid gap-2 md:grid-cols-4">
          <div className="rounded border p-3 text-sm">Open Cases: {summary.open_cases ?? 0}</div>
          <div className="rounded border p-3 text-sm">Blocked Cases: {summary.blocked_cases ?? 0}</div>
          <div className="rounded border p-3 text-sm">Ready to Reconcile: {summary.ready_to_reconcile ?? 0}</div>
          <div className="rounded border p-3 text-sm">Reconciled: {summary.reconciled_cases ?? 0}</div>
        </div>
      ) : null}
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
                <th className="px-3 py-2">Checklist</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`${ROUTES.admin.financeReversalControl}/${String(row.id)}`}>{String(row.case_no)}</Link>
                  </td>
                  <td className="px-3 py-2">{String(row.source_reference || "—")}</td>
                  <td className="px-3 py-2">{String(row.status)}</td>
                  <td className="px-3 py-2">{String(row.reconciliation_status || "PENDING")}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button className="rounded border px-2 py-1" type="button" onClick={() => void syncReversalCase(Number(row.id))}>
                        Run Sync
                      </button>
                      <button className="rounded border px-2 py-1" type="button" onClick={() => void reconcileReversalCase(Number(row.id), "Reviewed from reconciliation queue.")}>
                        Resolve/Mark Reviewed
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </PortalPage>
  );
}
