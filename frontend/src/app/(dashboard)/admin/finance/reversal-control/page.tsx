"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { createReversalCase, listReversalCases, type ReversalCase } from "@/services/reversal-control";

export default function ReversalControlPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ReversalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoading(true);
    });
    void listReversalCases(q)
      .then((payload) => {
        if (!active) return;
        setRows(payload.results);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load reversal cases");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [q]);

  const onQuickOpen = async () => {
    try {
      await createReversalCase({
        source_type: "OTHER",
        source_id: Date.now(),
        source_reference: `MANUAL-${Date.now()}`,
        reversal_type: "MANUAL_SETTLEMENT",
        reason: "Manual settlement intake from reversal control center.",
        amount_snapshot: "0.00",
      });
      const refreshed = await listReversalCases(q);
      setRows(refreshed.results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open reversal case");
    }
  };

  return (
    <PortalPage
      title="Reversal & Return Control"
      subtitle="Admin-only audited control center for cancellation, reversal, refund, and reconciliation decisions."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.root },
        { label: "Finance", href: ROUTES.admin.finance },
        { label: "Reversal & Return Control" },
      ]}
      actions={[{ label: "Reversal Reconciliation", href: ROUTES.admin.financeReversalReconciliation }]}
    >
      <div className="space-y-4">
        <button className="h-10 rounded border px-3 text-sm font-medium" type="button" onClick={() => void onQuickOpen()}>
          Open Manual Case
        </button>
        <input
          className="h-10 w-full rounded border px-3 text-sm"
          placeholder="Search customer, source ref, or reason..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />

        {loading ? <LoadingBlock label="Loading reversal control cases..." /> : null}
        {!loading && error ? <ErrorState title="Unable to load reversal cases" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState title="No reversal cases yet" description="Create a case to drive audited cancellation, refund, or return workflows." />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-hidden rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Case</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{row.case_no}</td>
                    <td className="px-3 py-2">{row.source_reference || `${row.source_type}#${row.source_id}`}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{row.reason}</td>
                    <td className="px-3 py-2">{row.amount_snapshot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </PortalPage>
  );
}
