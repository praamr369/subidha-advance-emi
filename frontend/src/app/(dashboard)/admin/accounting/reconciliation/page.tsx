"use client";

import { useCallback, useEffect, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import ActionButton from "@/components/ui/ActionButton";
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
    >
      {loading ? <LoadingBlock label="Loading reconciliation queue..." /> : null}
      {!loading && error ? <ErrorState title="Unable to load reconciliation" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">
                  {row.subscription_number || "N/A"} · {row.customer_name || "Unknown customer"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Payment #{row.payment_id} · {row.payment_method} · {row.status}
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Variance: {row.variance_amount} · Notes: {row.notes || "—"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton
                  variant="secondary"
                  onClick={() =>
                    void act(() => markAdminReconciliationReconciled(row.id, "Admin validated and marked reconciled"))
                  }
                >
                  Mark reconciled
                </ActionButton>
                <ActionButton
                  variant="outline"
                  onClick={() =>
                    void act(() => markAdminReconciliationUnreconciled(row.id, "Admin re-opened for follow-up"))
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
            </div>
          ))}
        </div>
      ) : null}
    </PortalPage>
  );
}

