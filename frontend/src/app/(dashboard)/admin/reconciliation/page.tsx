"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { RECONCILIATION_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable from "@/components/ui/DataTable";
import {
  DataTableShell,
  DetailPanel,
  KpiCard,
  QuickActionGrid,
} from "@/components/ui/operations";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { downloadCsv } from "@/lib/export/csv";
import {
  buildAdminPaymentRoute,
  buildAdminReconciliationRoute,
  buildAdminSubscriptionRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  flagReconciliation,
  listReconciliations,
  type ReconciliationRecord,
} from "@/services/reconciliation";
import { getReconciliationSnapshot } from "@/services/reports";

type ActiveView = "subscriptions" | "payments";

type ReconciliationSnapshot = Awaited<ReturnType<typeof getReconciliationSnapshot>>;
type ReconciliationExportRow = Record<string, string | number>;

type SnapshotRow = {
  id: number;
  subscription_id: number;
  subscription_number: string;
  customer_name?: string;
  total_amount: string;
  paid_amount: string;
  waived_amount: string;
  pending_outstanding: string;
  computed_outstanding: string;
  delta: string;
  flagged: boolean;
};

const DELTA_EPSILON = 0.009;

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function toRowsArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => toObject(item))
      .filter((item): item is Record<string, unknown> => item !== null);
  }

  const objectPayload = toObject(payload);
  if (!objectPayload) return [];

  const candidates = [objectPayload.rows, objectPayload.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item) => toObject(item))
        .filter((item): item is Record<string, unknown> => item !== null);
    }
  }

  return [];
}

function normalizeSnapshotRow(raw: Record<string, unknown>): SnapshotRow {
  const subscriptionId =
    toNumber(raw.subscription_id) ||
    toNumber(raw.subscription) ||
    toNumber(raw.id);

  const rawDelta = raw.delta;
  const deltaValue = toNumber(rawDelta);
  const explicitFlag = toBoolean(raw.flagged);

  return {
    id: toNumber(raw.id) || subscriptionId,
    subscription_id: subscriptionId,
    subscription_number:
      toStringValue(raw.subscription_number) || `SUB-${subscriptionId}`,
    customer_name: toStringValue(raw.customer_name) || undefined,
    total_amount: toMoneyString(raw.total_amount ?? raw.total),
    paid_amount: toMoneyString(raw.paid_amount ?? raw.paid),
    waived_amount: toMoneyString(raw.waived_amount ?? raw.waived),
    pending_outstanding: toMoneyString(
      raw.pending_outstanding ?? raw.outstanding
    ),
    computed_outstanding: toMoneyString(
      raw.computed_outstanding ?? raw.computed
    ),
    delta: toMoneyString(rawDelta),
    flagged: explicitFlag || Math.abs(deltaValue) > DELTA_EPSILON,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load reconciliation workspace.";
}

function parseBooleanFilter(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function ModeButton({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-medium transition duration-200",
        active
          ? "border-slate-900/10 bg-slate-900 text-white shadow-[0_18px_42px_-28px_rgba(15,23,42,0.8)]"
          : "border-white/80 bg-white/75 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] hover:-translate-y-0.5 hover:bg-white",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function kpiToneClass(
  tone?: "default" | "warning" | "success" | "danger"
): string | undefined {
  if (tone === "danger") return "border-destructive/25 bg-destructive/5";
  if (tone === "warning") return "border-[color-mix(in_oklab,var(--warning)_35%,var(--border)_65%)]";
  if (tone === "success") return "border-[color-mix(in_oklab,var(--success)_35%,var(--border)_65%)]";
  return undefined;
}

export default function AdminReconciliationPage() {
  const searchParams = useSearchParams();

  const activeView: ActiveView = useMemo(() => {
    return searchParams.get("view") === "payments" ? "payments" : "subscriptions";
  }, [searchParams]);

  const selectedSubscriptionId = useMemo(() => {
    const raw = searchParams.get("subscription");
    return raw ? toNumber(raw) : 0;
  }, [searchParams]);

  const selectedPaymentId = useMemo(() => {
    const raw = searchParams.get("payment");
    return raw ? toNumber(raw) : 0;
  }, [searchParams]);

  const selectedStatus = useMemo(
    () => (searchParams.get("status") || "").trim(),
    [searchParams]
  );
  const selectedSearch = useMemo(
    () => (searchParams.get("q") || "").trim(),
    [searchParams]
  );
  const selectedFlagged = useMemo(
    () => parseBooleanFilter(searchParams.get("flagged")),
    [searchParams]
  );
  const selectedLocked = useMemo(
    () => parseBooleanFilter(searchParams.get("locked")),
    [searchParams]
  );

  const [snapshot, setSnapshot] = useState<ReconciliationSnapshot | null>(null);
  const [snapshotRows, setSnapshotRows] = useState<SnapshotRow[]>([]);
  const [paymentRows, setPaymentRows] = useState<ReconciliationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flaggingId, setFlaggingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const loaders: Array<Promise<unknown>> = [getReconciliationSnapshot()];
        if (activeView === "payments") {
          loaders.push(
            listReconciliations({
              subscription: selectedSubscriptionId || undefined,
              payment: selectedPaymentId || undefined,
              status: selectedStatus || undefined,
              flagged: selectedFlagged,
              locked: selectedLocked,
              q: selectedSearch || undefined,
            })
          );
        }

        const [snapshotPayload, reconciliationPayload] = await Promise.all(loaders);
        setSnapshot(snapshotPayload as ReconciliationSnapshot);
        setSnapshotRows(
          toRowsArray(snapshotPayload).map(normalizeSnapshotRow)
        );
        setPaymentRows(
          activeView === "payments"
            ? ((reconciliationPayload as ReconciliationRecord[]) ?? [])
            : []
        );
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        setSnapshot(null);
        setSnapshotRows([]);
        setPaymentRows([]);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [
      activeView,
      selectedFlagged,
      selectedLocked,
      selectedPaymentId,
      selectedSearch,
      selectedStatus,
      selectedSubscriptionId,
    ]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const filteredSnapshotRows = useMemo(() => {
    if (selectedSubscriptionId <= 0) {
      return snapshotRows;
    }

    return snapshotRows.filter(
      (row) => row.subscription_id === selectedSubscriptionId
    );
  }, [selectedSubscriptionId, snapshotRows]);

  const checkedCount = useMemo(() => {
    const objectSnapshot = toObject(snapshot);
    const payloadChecked = toNumber(
      objectSnapshot?.checked_count ?? objectSnapshot?.checkedCount
    );

    if (selectedSubscriptionId > 0) {
      return filteredSnapshotRows.length;
    }

    return payloadChecked > 0 ? payloadChecked : snapshotRows.length;
  }, [filteredSnapshotRows.length, selectedSubscriptionId, snapshot, snapshotRows.length]);

  const flaggedCount = useMemo(() => {
    const objectSnapshot = toObject(snapshot);
    const payloadFlagged = toNumber(
      objectSnapshot?.flagged_count ?? objectSnapshot?.flaggedCount
    );

    if (selectedSubscriptionId > 0) {
      return filteredSnapshotRows.filter((row) => row.flagged).length;
    }

    return payloadFlagged > 0 ? payloadFlagged : filteredSnapshotRows.length;
  }, [filteredSnapshotRows, selectedSubscriptionId, snapshot]);

  const totalDelta = useMemo(
    () =>
      filteredSnapshotRows.reduce((sum, row) => sum + Math.abs(toNumber(row.delta)), 0),
    [filteredSnapshotRows]
  );

  const totalPendingOutstanding = useMemo(
    () =>
      filteredSnapshotRows.reduce(
        (sum, row) => sum + toNumber(row.pending_outstanding),
        0
      ),
    [filteredSnapshotRows]
  );

  const totalComputedOutstanding = useMemo(
    () =>
      filteredSnapshotRows.reduce(
        (sum, row) => sum + toNumber(row.computed_outstanding),
        0
      ),
    [filteredSnapshotRows]
  );

  const snapshotExportRows = useMemo(
    (): ReconciliationExportRow[] =>
      filteredSnapshotRows.map((row) => ({
        subscription_id: row.subscription_id,
        subscription_number: row.subscription_number,
        customer_name: row.customer_name ?? "",
        total_amount: row.total_amount,
        paid_amount: row.paid_amount,
        waived_amount: row.waived_amount,
        pending_outstanding: row.pending_outstanding,
        computed_outstanding: row.computed_outstanding,
        delta: row.delta,
      })),
    [filteredSnapshotRows]
  );

  const paymentExportRows = useMemo(
    (): ReconciliationExportRow[] =>
      paymentRows.map((row) => ({
        id: row.id,
        payment_id: row.payment_id ?? row.payment ?? "",
        subscription_number: row.subscription_number,
        customer_name: row.customer_name ?? "",
        reference_no: row.payment_reference_no ?? "",
        status: row.status,
        flagged: row.is_flagged ? "YES" : "NO",
        locked: row.is_locked ? "YES" : "NO",
        payment_amount: row.payment_amount ?? "0",
        expected_amount: row.expected_amount ?? "0",
        paid_amount: row.paid_amount ?? "0",
        variance_amount: row.variance_amount ?? "0",
        payment_date: row.payment_date ?? "",
        reconciled_at: row.reconciled_at ?? "",
        notes: row.notes ?? "",
      })),
    [paymentRows]
  );

  const paymentsViewHref = buildAdminReconciliationRoute({
    view: "payments",
    subscription: selectedSubscriptionId || undefined,
    payment: selectedPaymentId || undefined,
    status: selectedStatus || undefined,
    flagged: selectedFlagged,
    locked: selectedLocked,
    q: selectedSearch || undefined,
  });

  const subscriptionsViewHref = buildAdminReconciliationRoute({
    subscription: selectedSubscriptionId || undefined,
  });

  const paymentContextTitle = useMemo(() => {
    if (selectedSubscriptionId > 0 && selectedPaymentId > 0) {
      return `Filtered to subscription #${selectedSubscriptionId} and payment #${selectedPaymentId}.`;
    }
    if (selectedSubscriptionId > 0) {
      return `Filtered to subscription #${selectedSubscriptionId}.`;
    }
    if (selectedPaymentId > 0) {
      return `Filtered to payment #${selectedPaymentId}.`;
    }
    return "Showing the full payment reconciliation queue on the canonical admin reconciliation route.";
  }, [selectedPaymentId, selectedSubscriptionId]);

  const handleFlag = useCallback(
    async (row: ReconciliationRecord) => {
      if (row.is_flagged) return;

      const confirmed = window.confirm(
        `Flag reconciliation #${row.id}? This marks the record for operational follow-up.`
      );
      if (!confirmed) return;

      setFlaggingId(row.id);
      setError(null);

      try {
        await flagReconciliation(row.id, {
          reason: `Flagged from canonical admin reconciliation workspace for payment #${
            row.payment_id ?? row.payment ?? row.id
          }.`,
        });
        await loadPage("refresh");
      } catch (err) {
        setError(toErrorMessage(err));
      } finally {
        setFlaggingId(null);
      }
    },
    [loadPage]
  );

  return (
    <PortalPage
      eyebrow="Collections Reconciliation Control"
      title="Admin Reconciliation"
      subtitle="Canonical daily-operations reconciliation workspace for subscription attention and payment-level follow-up."
      helperNote="This route remains the canonical collection-side reconciliation workspace. Finance commission verification stays separate and linked, not merged."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Collections & EMI", href: ROUTES.admin.collections },
        { label: "Reconciliation" },
      ]}
      actions={[
        {
          href: ROUTES.admin.collections,
          label: "Collections Workspace",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.payments,
          label: "Payments Register",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.financeCommissions,
          label: "Commission Register",
          variant: "ghost",
        },
      ]}
      stats={[
        {
          label: "Checked Rows",
          value: String(checkedCount),
        },
        {
          label: "Flagged Rows",
          value: String(flaggedCount),
          tone: flaggedCount > 0 ? "warning" : undefined,
        },
        {
          label:
            activeView === "payments"
              ? "Payment Reconciliation Rows"
              : "Pending Outstanding",
          value:
            activeView === "payments"
              ? String(paymentRows.length)
              : money(totalPendingOutstanding),
          tone:
            activeView === "payments"
              ? paymentRows.some((row) => row.is_flagged)
                ? "warning"
                : undefined
              : undefined,
        },
        {
          label:
            activeView === "payments" ? "Delta Exposure" : "Computed Outstanding",
          value:
            activeView === "payments"
              ? money(totalDelta)
              : money(totalComputedOutstanding),
          tone: totalDelta > 0 ? "danger" : undefined,
        },
      ]}
      statusBadge={{
        label:
          activeView === "payments"
            ? "Payment Queue"
            : "Subscription Attention",
        tone: activeView === "payments" ? "warning" : "info",
      }}
    >
      <div className="space-y-6">
        <WorkspaceDirectory
          title="Reconciliation route map"
          description="Move between collection-side reconciliation, payment review, collections workflow, and finance-side follow-up without crossing domain boundaries."
          groups={RECONCILIATION_DIRECTORY_GROUPS}
        />

        <DetailPanel
          title="Canonical workflow mode"
          description="Subscription attention and payment reconciliation share one operational route. Switch modes without changing filter context in the URL."
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <ModeButton href={subscriptionsViewHref} active={activeView === "subscriptions"}>
                Subscription Attention
              </ModeButton>
              <ModeButton href={paymentsViewHref} active={activeView === "payments"}>
                Payment Queue
              </ModeButton>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                disabled={refreshing || loading}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                disabled={
                  loading ||
                  (activeView === "payments"
                    ? paymentExportRows.length === 0
                    : snapshotExportRows.length === 0)
                }
                onClick={() =>
                  downloadCsv<ReconciliationExportRow>(
                    activeView === "payments"
                      ? "admin-reconciliation-payments.csv"
                      : "admin-reconciliation-subscriptions.csv",
                    activeView === "payments"
                      ? [
                          { key: "id", header: "id" },
                          { key: "payment_id", header: "payment_id" },
                          { key: "subscription_number", header: "subscription_number" },
                          { key: "customer_name", header: "customer_name" },
                          { key: "reference_no", header: "reference_no" },
                          { key: "status", header: "status" },
                          { key: "flagged", header: "flagged" },
                          { key: "locked", header: "locked" },
                          { key: "payment_amount", header: "payment_amount" },
                          { key: "expected_amount", header: "expected_amount" },
                          { key: "paid_amount", header: "paid_amount" },
                          { key: "variance_amount", header: "variance_amount" },
                          { key: "payment_date", header: "payment_date" },
                          { key: "reconciled_at", header: "reconciled_at" },
                          { key: "notes", header: "notes" },
                        ]
                      : [
                          { key: "subscription_id", header: "subscription_id" },
                          { key: "subscription_number", header: "subscription_number" },
                          { key: "customer_name", header: "customer_name" },
                          { key: "total_amount", header: "total_amount" },
                          { key: "paid_amount", header: "paid_amount" },
                          { key: "waived_amount", header: "waived_amount" },
                          { key: "pending_outstanding", header: "pending_outstanding" },
                          { key: "computed_outstanding", header: "computed_outstanding" },
                          { key: "delta", header: "delta" },
                        ],
                    activeView === "payments" ? paymentExportRows : snapshotExportRows
                  )
                }
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Export Current View
              </button>
            </div>
          </div>
        </DetailPanel>

        {loading ? <LoadingBlock label="Loading reconciliation workspace..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load reconciliation workspace"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && activeView === "subscriptions" ? (
          <>
            <DetailPanel
              title="Subscription attention"
              description="This view shows only subscription rows where pending outstanding and contract-derived remaining exposure do not align."
            >
              <QuickActionGrid className="md:grid-cols-3">
                <KpiCard
                  label="Checked rows"
                  value={String(checkedCount)}
                  helper="Subscriptions inspected in the canonical attention snapshot"
                />
                <KpiCard
                  className={kpiToneClass(flaggedCount > 0 ? "warning" : "success")}
                  label="Flagged mismatches"
                  value={String(flaggedCount)}
                  helper="Rows requiring reconciliation follow-up"
                />
                <KpiCard
                  className={kpiToneClass(totalDelta > 0 ? "danger" : "success")}
                  label="Delta exposure"
                  value={money(totalDelta)}
                  helper="Absolute mismatch between pending and computed outstanding"
                />
              </QuickActionGrid>
            </DetailPanel>

            <DetailPanel
              title="Flagged subscription rows"
              description="Open subscription detail to inspect canonical financial truth, or jump into payment reconciliation filtered to the affected contract."
            >
              {filteredSnapshotRows.length === 0 ? (
                <EmptyState
                  title="No reconciliation mismatches"
                  description="No subscription-level mismatches are currently flagged."
                />
              ) : (
                <DataTableShell>
                  <DataTable<SnapshotRow>
                    rows={filteredSnapshotRows}
                    emptyText="No flagged subscription rows."
                    columns={[
                    {
                      key: "subscription_number",
                      title: "Subscription",
                      render: (row) => (
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">
                            {row.subscription_number}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Subscription ID {row.subscription_id}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "customer_name",
                      title: "Customer",
                      render: (row) => row.customer_name || "Unknown customer",
                    },
                    {
                      key: "contract",
                      title: "Contract",
                      render: (row) => (
                        <div className="space-y-1 text-sm">
                          <div>Total {money(row.total_amount)}</div>
                          <div className="text-xs text-muted-foreground">
                            Paid {money(row.paid_amount)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Waived {money(row.waived_amount)}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "outstanding",
                      title: "Outstanding",
                      render: (row) => (
                        <div className="space-y-1 text-sm">
                          <div>Pending {money(row.pending_outstanding)}</div>
                          <div className="text-xs text-muted-foreground">
                            Computed {money(row.computed_outstanding)}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "delta",
                      title: "Delta",
                      align: "right",
                      render: (row) => money(row.delta),
                    },
                    {
                      key: "actions",
                      title: "Actions",
                      render: (row) => (
                        <div className="flex flex-col items-start gap-2">
                          <Link
                            href={buildAdminSubscriptionRoute(row.subscription_id)}
                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                          >
                            Subscription
                          </Link>
                          <Link
                            href={buildAdminReconciliationRoute({
                              view: "payments",
                              subscription: row.subscription_id,
                            })}
                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                          >
                            Payment Queue
                          </Link>
                        </div>
                      ),
                    },
                    ]}
                  />
                </DataTableShell>
              )}
            </DetailPanel>
          </>
        ) : null}

        {!loading && !error && activeView === "payments" ? (
          <>
            <DetailPanel
              title="Payment reconciliation queue"
              description="This is the canonical payment-level follow-up workspace. Older `/admin/payments/reconciliation` links now redirect here."
            >
              <QuickActionGrid className="md:grid-cols-3">
                <KpiCard
                  label="Payment rows"
                  value={String(paymentRows.length)}
                  helper="Reconciliation records in the current filter context"
                />
                <KpiCard
                  className={kpiToneClass(
                    paymentRows.some((row) => row.is_flagged) ? "warning" : "success"
                  )}
                  label="Flagged payments"
                  value={String(paymentRows.filter((row) => row.is_flagged).length)}
                  helper="Payment rows already marked for follow-up"
                />
                <KpiCard
                  label="Context"
                  value={
                    selectedSubscriptionId > 0
                      ? `SUB-${selectedSubscriptionId}`
                      : selectedPaymentId > 0
                        ? `PAY-${selectedPaymentId}`
                        : "Portfolio"
                  }
                  helper={paymentContextTitle}
                />
              </QuickActionGrid>
            </DetailPanel>

            {selectedSubscriptionId > 0 && filteredSnapshotRows.length > 0 ? (
              <DetailPanel
                title="Subscription attention in current context"
                description="This payment view stays anchored to the same subscription-level attention truth."
              >
                <div className="space-y-3">
                  {filteredSnapshotRows.map((row) => (
                    <div
                      key={`${row.subscription_id}-${row.id}`}
                      className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="font-medium text-foreground">
                            {row.subscription_number} ·{" "}
                            {row.customer_name || "Unknown customer"}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            Pending {money(row.pending_outstanding)} · Computed{" "}
                            {money(row.computed_outstanding)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Total {money(row.total_amount)} · Paid{" "}
                            {money(row.paid_amount)} · Waived{" "}
                            {money(row.waived_amount)}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-semibold text-foreground">
                              {money(row.delta)}
                            </div>
                            <div className="text-xs text-muted-foreground">Delta</div>
                          </div>

                          <Link
                            href={buildAdminReconciliationRoute({
                              subscription: row.subscription_id,
                            })}
                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                          >
                            Subscription Attention
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </DetailPanel>
            ) : null}

            {paymentRows.length === 0 ? (
              <EmptyState
                title="No payment reconciliation rows"
                description={
                  selectedSubscriptionId > 0 || selectedPaymentId > 0
                    ? "No payment reconciliation records match the current filter context."
                    : "No payment reconciliation records are currently available for admin review."
                }
              />
            ) : (
              <DataTableShell>
                <DataTable<ReconciliationRecord>
                  rows={paymentRows}
                  emptyText="No payment reconciliation rows."
                  columns={[
                  {
                    key: "record",
                    title: "Record",
                    render: (row) => (
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">
                          Reconciliation #{row.id}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Payment #{row.payment_id ?? row.payment ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.payment_reference_no || "No reference"}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "subscription",
                    title: "Subscription",
                    render: (row) => (
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">
                          {row.subscription_number}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.customer_name || "Unknown customer"}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "amounts",
                    title: "Amounts",
                    render: (row) => (
                      <div className="space-y-1 text-sm">
                        <div>Payment {money(row.payment_amount ?? 0)}</div>
                        <div>Expected {money(row.expected_amount ?? 0)}</div>
                        <div>Paid {money(row.paid_amount ?? 0)}</div>
                      </div>
                    ),
                  },
                  {
                    key: "variance_amount",
                    title: "Variance",
                    align: "right",
                    render: (row) => money(row.variance_amount ?? 0),
                  },
                  {
                    key: "status",
                    title: "State",
                    render: (row) => (
                      <div className="space-y-1">
                        <StatusBadge status={row.status} label={row.status} />
                        <div className="text-xs text-muted-foreground">
                          {row.is_flagged ? "Flagged" : "Not flagged"} ·{" "}
                          {row.is_locked ? "Locked" : "Unlocked"}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "actions",
                    title: "Actions",
                    render: (row) => (
                      <div className="flex flex-col items-start gap-2">
                        <Link
                          href={buildAdminPaymentRoute(
                            row.payment_id ?? row.payment ?? row.id
                          )}
                          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                        >
                          Payment
                        </Link>

                        {typeof row.subscription_id === "number" ? (
                          <Link
                            href={buildAdminSubscriptionRoute(row.subscription_id)}
                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                          >
                            Subscription
                          </Link>
                        ) : null}

                        <button
                          type="button"
                          disabled={row.is_flagged || flaggingId === row.id}
                          onClick={() => void handleFlag(row)}
                          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {flaggingId === row.id
                            ? "Flagging..."
                            : row.is_flagged
                            ? "Already Flagged"
                            : "Flag"}
                        </button>
                      </div>
                    ),
                  },
                  ]}
                />
              </DataTableShell>
            )}
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
