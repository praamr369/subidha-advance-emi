"use client";

import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { AccountingControlShell } from "@/components/layout/page-shells";
import PortalPage from "@/components/ui/PortalPage";
import { MetricStrip } from "@/components/ui/operations";
import ActionButton from "@/components/ui/ActionButton";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import { DataTableShell, MobileSafeTable } from "@/components/ui/operations";
import {
  attachAdminReconciliationReference,
  markAdminReconciliationReconciled,
  markAdminReconciliationUnreconciled,
} from "@/services/phase5-control";
import { request } from "@/services/api";

type Row = {
  id: number;
  payment_id: number;
  customer_name: string;
  subscription_number: string;
  payment_method: string;
  status: string;
  variance_amount: string;
  notes: string;
};

export default function AdminAccountingReconciliationPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request<{ results: Row[] }>("/admin/accounting/unreconciled/");
      setRows(data.results || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reconciliation rows.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    },
    [load]
  );

  return (
    <PortalPage
      title="Accounting Reconciliation Control"
      subtitle="Admin-only operational reconciliation actions with reason/reference trails."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Accounting", href: "/admin/accounting" },
        { label: "Reconciliation" },
      ]}
      actions={[{ href: "/admin/accounting/control-center", label: "Back to control center", variant: "secondary" }]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <AccountingControlShell
        readinessWarnings={
          <div className="space-y-4">
            {loading ? <LoadingBlock label="Loading reconciliation queue..." /> : null}
            {!loading && error ? (
              <ErrorState title="Unable to load reconciliation" description={error} onRetry={() => void load()} />
            ) : null}
            {!loading && !error ? (
              <MetricStrip items={[{ label: "Unreconciled queue depth", value: String(rows.length) }]} />
            ) : null}
          </div>
        }
        primaryRegister={
          !loading && !error ? (
            <div className="space-y-4">
              <TableToolbar
                title="Exception-first reconciliation queue"
                description="Rows below are unresolved accounting/reconciliation entries. Resolve or reopen each row with an explicit reason."
              >
                <ActionButton variant="outline" onClick={() => void load()}>
                  Refresh Queue
                </ActionButton>
              </TableToolbar>
              {rows.length === 0 ? (
                <EmptyState
                  title="No reconciliation exceptions"
                  description="No unreconciled rows are returned from the accounting queue."
                />
              ) : (
                <DataTableShell>
                  <MobileSafeTable className="border-none bg-transparent">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="text-left">
                          <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Contract / Customer
                          </th>
                          <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Payment
                          </th>
                          <th className="border-b border-border px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Variance
                          </th>
                          <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Status
                          </th>
                          <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id} className="align-top">
                            <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                              <div className="font-medium">
                                {row.subscription_number || "N/A"} · {row.customer_name || "Unknown customer"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">Notes: {row.notes || "—"}</div>
                            </td>
                            <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                              <div>Payment #{row.payment_id}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{row.payment_method}</div>
                            </td>
                            <td className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-foreground">
                              ₹{Number(row.variance_amount || 0).toFixed(2)}
                            </td>
                            <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                              <StatusBadge
                                status={
                                  String(row.status || "")
                                    .toUpperCase()
                                    .includes("RECONCILED")
                                    ? "COMPLETED"
                                    : "BLOCKED"
                                }
                              />
                            </td>
                            <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                              <div className="flex flex-wrap gap-2">
                                <ActionButton
                                  variant="secondary"
                                  onClick={() =>
                                    void act(() =>
                                      markAdminReconciliationReconciled(
                                        row.id,
                                        "Admin validated and marked reconciled"
                                      )
                                    )
                                  }
                                >
                                  Mark reconciled
                                </ActionButton>
                                <ActionButton
                                  variant="outline"
                                  onClick={() =>
                                    void act(() =>
                                      markAdminReconciliationUnreconciled(row.id, "Admin re-opened for follow-up")
                                    )
                                  }
                                >
                                  Mark unreconciled
                                </ActionButton>
                                <ActionButton
                                  variant="outline"
                                  onClick={() =>
                                    void act(() =>
                                      attachAdminReconciliationReference(
                                        row.id,
                                        `MANUAL-${row.payment_id}`,
                                        "Reference attached from reconciliation UI"
                                      )
                                    )
                                  }
                                >
                                  Attach reference
                                </ActionButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </MobileSafeTable>
                </DataTableShell>
              )}
            </div>
          ) : null
        }
      />
    </PortalPage>
  );
}
