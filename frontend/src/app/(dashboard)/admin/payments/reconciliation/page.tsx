"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable from "@/components/ui/DataTable";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { downloadCsv } from "@/lib/export/csv";
import { getReconciliationSnapshot } from "@/services/reports";
import {
  flagReconciliation,
  listReconciliations,
  type ReconciliationRecord,
} from "@/services/reconciliation";

type ReconciliationSnapshot = Awaited<
  ReturnType<typeof getReconciliationSnapshot>
>;

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

function money(value: string | number): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load payment reconciliation workspace.";
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

function normalizeSnapshotRows(
  snapshot: ReconciliationSnapshot | null
): SnapshotRow[] {
  if (!snapshot || !Array.isArray(snapshot.results)) {
    return [];
  }

  return snapshot.results.map((row) => ({
    id: toNumber(row.id),
    subscription_id: toNumber(row.subscription_id),
    subscription_number:
      toStringValue(row.subscription_number) ||
      `SUB-${toNumber(row.subscription_id)}`,
    customer_name: toStringValue(row.customer_name) || undefined,
    total_amount: String(row.total_amount ?? "0"),
    paid_amount: String(row.paid_amount ?? "0"),
    waived_amount: String(row.waived_amount ?? "0"),
    pending_outstanding: String(row.pending_outstanding ?? "0"),
    computed_outstanding: String(row.computed_outstanding ?? "0"),
    delta: String(row.delta ?? "0"),
    flagged: toBoolean(row.flagged) || Math.abs(toNumber(row.delta)) > 0.009,
  }));
}

export default function AdminPaymentReconciliationPage() {
  const searchParams = useSearchParams();

  const selectedSubscriptionId = useMemo(() => {
    const raw = searchParams.get("subscription");
    return raw ? toNumber(raw) : 0;
  }, [searchParams]);

  const selectedPaymentId = useMemo(() => {
    const raw = searchParams.get("payment");
    return raw ? toNumber(raw) : 0;
  }, [searchParams]);

  const [snapshot, setSnapshot] = useState<ReconciliationSnapshot | null>(null);
  const [rows, setRows] = useState<ReconciliationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flaggingId, setFlaggingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const [snapshotPayload, reconciliationRows] = await Promise.all([
          getReconciliationSnapshot(),
          listReconciliations({
            subscription: selectedSubscriptionId || undefined,
            payment: selectedPaymentId || undefined,
          }),
        ]);

        setSnapshot(snapshotPayload);
        setRows(reconciliationRows);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        setSnapshot(null);
        setRows([]);
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [selectedPaymentId, selectedSubscriptionId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const snapshotRows = useMemo(() => normalizeSnapshotRows(snapshot), [snapshot]);

  const filteredSnapshotRows = useMemo(() => {
    let nextRows = snapshotRows;

    if (selectedSubscriptionId > 0) {
      nextRows = nextRows.filter(
        (row) => row.subscription_id === selectedSubscriptionId
      );
    }

    return nextRows;
  }, [snapshotRows, selectedSubscriptionId]);

  const checkedSnapshotCount = useMemo(() => {
    if (selectedSubscriptionId > 0) {
      return filteredSnapshotRows.length;
    }
    return toNumber(snapshot?.checkedCount ?? snapshot?.checked_count ?? 0);
  }, [snapshot, filteredSnapshotRows.length, selectedSubscriptionId]);

  const flaggedSnapshotCount = useMemo(() => {
    if (selectedSubscriptionId > 0) {
      return filteredSnapshotRows.filter((row) => row.flagged).length;
    }
    return toNumber(snapshot?.flaggedCount ?? snapshot?.flagged_count ?? 0);
  }, [snapshot, filteredSnapshotRows, selectedSubscriptionId]);

  const contextTitle = useMemo(() => {
    if (selectedSubscriptionId > 0 && selectedPaymentId > 0) {
      return `Filtered to subscription #${selectedSubscriptionId} and payment #${selectedPaymentId}.`;
    }
    if (selectedSubscriptionId > 0) {
      return `Filtered to subscription #${selectedSubscriptionId}.`;
    }
    if (selectedPaymentId > 0) {
      return `Filtered to payment #${selectedPaymentId}.`;
    }
    return "Showing the full payment reconciliation workspace.";
  }, [selectedSubscriptionId, selectedPaymentId]);

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
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
    [rows]
  );

  const handleFlag = useCallback(
    async (row: ReconciliationRecord) => {
      if (row.is_flagged) return;

      const confirmed = window.confirm(
        `Flag reconciliation #${row.id}? This will mark the reconciliation record for operational follow-up.`
      );
      if (!confirmed) return;

      setFlaggingId(row.id);
      setError(null);

      try {
        await flagReconciliation(row.id, {
          reason: `Flagged from admin payment reconciliation workspace for payment #${
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
    <div className="space-y-6">
      <PageHeader
        title="Payment Reconciliation"
        description="Review payment reconciliation records, inspect variances, and raise operational flags where payment-ledger mismatches need admin attention."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              disabled={exportRows.length === 0}
              onClick={() =>
                downloadCsv(
                  "payment-reconciliation-current-view.csv",
                  [
                    { key: "id", header: "id" },
                    { key: "payment_id", header: "payment_id" },
                    {
                      key: "subscription_number",
                      header: "subscription_number",
                    },
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
                  ],
                  exportRows
                )
              }
              className="inline-flex items-center rounded-md border border-border bg-foreground px-3 py-2 text-sm font-medium text-background shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export Current View
            </button>
          </div>
        }
      />

      {loading ? <LoadingBlock label="Loading payment reconciliation..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load payment reconciliation"
          description={error}
          onRetry={() => void loadPage("initial")}
        />
      ) : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Checked Snapshot Records"
              value={String(checkedSnapshotCount)}
              subtext="Subscription-level rows in the current reconciliation context"
            />
            <StatCard
              label="Flagged Snapshot Rows"
              value={String(flaggedSnapshotCount)}
              subtext="Subscription-level exceptions surfaced by reconciliation attention"
            />
            <StatCard
              label="Payment Reconciliation Rows"
              value={String(rows.length)}
              subtext="Payment reconciliation records available for admin review"
            />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-sm font-semibold text-foreground">
              Workspace note
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              This page is the payment-level reconciliation workspace. Use it to
              inspect individual reconciliation records and flag exceptions.
              Portfolio-level subscription mismatches remain available in the
              admin reconciliation report.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{contextTitle}</p>
          </div>

          {selectedSubscriptionId > 0 && filteredSnapshotRows.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <div className="text-sm font-semibold text-foreground">
                Subscription reconciliation attention
              </div>
              <div className="mt-3 space-y-3">
                {filteredSnapshotRows.map((row) => (
                  <div
                    key={`${row.subscription_id}-${row.id}`}
                    className="rounded-xl border border-amber-200 bg-white p-4"
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
                          <div className="text-xs text-muted-foreground">
                            Delta
                          </div>
                        </div>

                        <Link
                          href="/admin/reconciliation"
                          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                        >
                          Open Portfolio Reconciliation
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState
              title="No payment reconciliation rows"
              description={
                selectedSubscriptionId > 0 || selectedPaymentId > 0
                  ? "No payment reconciliation records match the current filter context. This can happen when a subscription-level mismatch exists but no payment-level reconciliation row has been created yet."
                  : "No payment reconciliation records are currently available for admin review."
              }
            />
          ) : (
            <DataTable<ReconciliationRecord>
              rows={rows}
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
                      <div>Payment: {money(row.payment_amount ?? 0)}</div>
                      <div>Expected: {money(row.expected_amount ?? 0)}</div>
                      <div>Paid: {money(row.paid_amount ?? 0)}</div>
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
                      <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                        {row.status}
                      </span>
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
                        href={`/admin/payments/${
                          row.payment_id ?? row.payment ?? row.id
                        }`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Payment
                      </Link>

                      {typeof row.subscription_id === "number" ? (
                        <Link
                          href={`/admin/subscriptions/${row.subscription_id}`}
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
          )}
        </>
      ) : null}
    </div>
  );
}