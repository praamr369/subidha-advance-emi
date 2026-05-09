"use client";

import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import ActionButton from "@/components/ui/ActionButton";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import { getAdminOperationsQueueSummary } from "@/services/phase5-control";
import { getHrSummary, type HrSummary } from "@/services/admin-hr";

type QueueRow = {
  key: string;
  count: number;
  severity?: string;
  detail_url?: string;
};

function routeForQueue(key: string, fallback?: string): string {
  if (key.includes("overdue")) return ROUTES.admin.financeCollect;
  if (key.includes("delivery")) return ROUTES.admin.deliveries;
  if (key.includes("kyc")) return `${ROUTES.admin.customers}?kyc_status=PENDING`;
  if (key.includes("stock")) return ROUTES.admin.inventoryStockOnHand;
  return fallback || ROUTES.admin.operationsCommandCenter;
}

function actionLabelForQueue(key: string): string {
  if (key.includes("overdue")) return "Collect Now";
  if (key.includes("delivery")) return "Resolve Delivery";
  if (key.includes("kyc")) return "Review KYC";
  if (key.includes("stock")) return "Fix Stock";
  return "Take Action";
}

export default function AdminOperationsWorkspacePage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [hrSummary, setHrSummary] = useState<HrSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([getAdminOperationsQueueSummary(), getHrSummary()])
      .then(([queuePayload, hrPayload]) => {
        if (!active) return;
        const queue = queuePayload as { results?: QueueRow[] } | null;
        setRows(queue?.results || []);
        setHrSummary(hrPayload);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load operations workspace.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const focusRows = useMemo(() => {
    const keys = [
      "overdue_payments",
      "delivery_blocked",
      "low_stock_alerts",
      "customer_kyc_pending",
    ];
    return keys
      .map((key) => rows.find((row) => row.key === key))
      .filter((row): row is QueueRow => Boolean(row));
  }, [rows]);

  return (
    <PortalPage
      eyebrow="Operations"
      title="Operations Working Screen"
      subtitle="Action-first queues for payment collection, delivery, stock, KYC, and HR approvals."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Operations" },
      ]}
      actions={[
        { href: ROUTES.admin.dashboard, label: "Back to Dashboard", variant: "secondary" },
        { href: ROUTES.admin.operationsCommandCenter, label: "Command Center", variant: "secondary" },
      ]}
      statusBadge={{ label: "Action Mode", tone: "warning" }}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading operations queues..." /> : null}
        {!loading && error ? (
          <ErrorState
            title="Unable to load operations workspace"
            description={error}
          />
        ) : null}
        {!loading && !error && focusRows.length === 0 ? (
          <EmptyState
            title="No operational queues returned"
            description="No active overdue, delivery, stock, or KYC queue rows were returned by the current operations summary payload."
          />
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(focusRows.length ? focusRows : [{ key: "overdue_payments", count: 0 } as QueueRow]).map((row, index) => {
            const href = routeForQueue(row.key, row.detail_url);
            return (
              <article key={`op-focus-${row.key}-${index}`} className="rounded-2xl border border-white/80 bg-white/80 p-4">
                <div className="text-sm font-semibold text-foreground">{row.key.replaceAll("_", " ")}</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{row.count}</div>
                <div className="mt-2">
                  <StatusBadge status={String(row.severity || "INFO").toUpperCase()} hideIcon />
                </div>
                <div className="mt-3 flex gap-2">
                  <ActionButton href={href} size="sm" variant="secondary">View Queue</ActionButton>
                  <ActionButton href={href} size="sm" variant="primary">{actionLabelForQueue(row.key)}</ActionButton>
                </div>
              </article>
            );
          })}
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
          <h2 className="text-base font-semibold text-foreground">HR Actions</h2>
          <p className="mt-1 text-sm text-muted-foreground">Bring daily staff tasks into the same operator workflow.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-white/80 bg-white/80 p-4">
              <div className="text-xs text-muted-foreground">Mark attendance</div>
              <div className="mt-2">
                <ActionButton href={ROUTES.admin.hrAttendance} size="sm" variant="primary">Mark Attendance</ActionButton>
              </div>
            </article>
            <article className="rounded-xl border border-white/80 bg-white/80 p-4">
              <div className="text-xs text-muted-foreground">Pending leave</div>
              <div className="mt-1 text-2xl font-semibold">{hrSummary?.pending_leave_requests ?? 0}</div>
              <div className="mt-2">
                <ActionButton href={ROUTES.admin.hrLeave} size="sm" variant="primary">Approve Leave</ActionButton>
              </div>
            </article>
            <article className="rounded-xl border border-white/80 bg-white/80 p-4">
              <div className="text-xs text-muted-foreground">Pending expenses</div>
              <div className="mt-1 text-2xl font-semibold">{hrSummary?.pending_expense_claims ?? 0}</div>
              <div className="mt-2">
                <ActionButton href={ROUTES.admin.hrExpenses} size="sm" variant="primary">Approve Expense</ActionButton>
              </div>
            </article>
            <article className="rounded-xl border border-white/80 bg-white/80 p-4">
              <div className="text-xs text-muted-foreground">Payroll pending</div>
              <div className="mt-1 text-2xl font-semibold">{hrSummary?.payroll_pending ?? 0}</div>
              <div className="mt-2">
                <ActionButton href={ROUTES.admin.hrPayroll} size="sm" variant="primary">Open Payroll</ActionButton>
              </div>
            </article>
          </div>
        </section>
      </div>
    </PortalPage>
  );
}
