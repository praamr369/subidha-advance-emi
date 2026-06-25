"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { ApprovalQueuePageShell } from "@/components/layout/page-shells";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { MetricStrip } from "@/components/ui/operations";
import { ROUTES } from "@/lib/routes";
import { fetchReversalReconciliationQueue, reconcileReversalCase, syncReversalCase } from "@/services/reversal-control";

type SummaryKey = "open_cases" | "blocked_cases" | "ready_to_reconcile" | "reconciled_cases";

function summaryValue(summary: Record<string, number>, key: SummaryKey): string | null {
  const value = summary?.[key];
  return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

function cellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && !value.trim()) return "—";
  return String(value);
}

export default function ReversalReconciliationPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);

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
    <ERPPageShell
      title="Reversal Reconciliation"
      subtitle="Approval-style queue for unresolved reversal/refund/return links that must be reconciled with explicit evidence."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.root },
        { label: "Finance", href: ROUTES.admin.finance },
        { label: "Reversal Reconciliation" },
      ]}
    >
      <ApprovalQueuePageShell
        queueSummary={
          <div className="space-y-4">
            {loading ? <LoadingBlock label="Loading reconciliation queue..." /> : null}
            {!loading && error ? <ErrorState title="Unable to load queue" description={error} /> : null}
            {!loading && !error ? (
              <MetricStrip
                items={[
                  { label: "Open cases", value: summaryValue(summary, "open_cases") ?? "—" },
                  { label: "Blocked cases", value: summaryValue(summary, "blocked_cases") ?? "—" },
                  { label: "Ready to reconcile", value: summaryValue(summary, "ready_to_reconcile") ?? "—" },
                  { label: "Reconciled", value: summaryValue(summary, "reconciled_cases") ?? "—" },
                ]}
              />
            ) : null}
          </div>
        }
        queueList={
          !loading && !error ? (
            rows.length === 0 ? (
              <EmptyState title="Queue is clear" description="No open reversal reconciliation rows are pending." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2">Case</th>
                      <th className="px-3 py-2">Reason / source</th>
                      <th className="px-3 py-2">Accounting impact</th>
                      <th className="px-3 py-2">Reconciliation</th>
                      <th className="px-3 py-2">Audit evidence</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={String(row.id)} className="border-t border-border align-top">
                        <td className="px-3 py-2 font-medium">
                          <Link
                            href={`${ROUTES.admin.financeReversalControl}/${String(row.id)}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {cellValue(row.case_no)}
                          </Link>
                          <div className="mt-1 text-xs text-muted-foreground">Case ID {cellValue(row.id)}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{cellValue(row.reason)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {cellValue(row.source_reference || row.source_type)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{cellValue(row.amount_snapshot ?? row.amount ?? "—")}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Original {cellValue(row.original_payment_id ?? row.payment_id ?? row.source_id ?? "—")}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-sm">{cellValue(row.status)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Checklist: {cellValue(row.reconciliation_status || "PENDING")}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-xs text-muted-foreground">
                            {cellValue(row.audit_reference ?? row.evidence_reference ?? row.source_reference ?? "—")}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                              type="button"
                              disabled={actingId === Number(row.id)}
                              onClick={() => {
                                const id = Number(row.id);
                                setActingId(id);
                                void syncReversalCase(id).finally(() => setActingId(null));
                              }}
                            >
                              {actingId === Number(row.id) ? "Syncing..." : "Run sync"}
                            </button>
                            <button
                              className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                              type="button"
                              disabled={actingId === Number(row.id)}
                              onClick={() => {
                                const id = Number(row.id);
                                const ok = window.confirm(
                                  `Mark reversal case #${cellValue(row.case_no)} as reviewed? This should only be used after evidence is checked.`
                                );
                                if (!ok) return;
                                setActingId(id);
                                void reconcileReversalCase(id, "Reviewed from reversal reconciliation queue.").finally(() =>
                                  setActingId(null)
                                );
                              }}
                            >
                              {actingId === Number(row.id) ? "Updating..." : "Mark reviewed"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null
        }
      />
    </ERPPageShell>
  );
}
