"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { downloadCsv } from "@/lib/export/csv";
import { getReconciliationSnapshot } from "@/services/reports";

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

  const rawTotal = raw.total_amount ?? raw.total;
  const rawPaid = raw.paid_amount ?? raw.paid;
  const rawWaived = raw.waived_amount ?? raw.waived;
  const rawPending = raw.pending_outstanding ?? raw.outstanding;
  const rawComputed = raw.computed_outstanding ?? raw.computed;
  const rawDelta = raw.delta;

  const deltaValue = toNumber(rawDelta);
  const explicitFlag = toBoolean(raw.flagged);
  const computedFlag = Math.abs(deltaValue) > DELTA_EPSILON;

  return {
    id: toNumber(raw.id) || subscriptionId,
    subscription_id: subscriptionId,
    subscription_number:
      toStringValue(raw.subscription_number) || `SUB-${subscriptionId}`,
    customer_name: toStringValue(raw.customer_name) || undefined,
    total_amount: toMoneyString(rawTotal),
    paid_amount: toMoneyString(rawPaid),
    waived_amount: toMoneyString(rawWaived),
    pending_outstanding: toMoneyString(rawPending),
    computed_outstanding: toMoneyString(rawComputed),
    delta: toMoneyString(rawDelta),
    flagged: explicitFlag || computedFlag,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load reconciliation dashboard.";
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AdminReconciliationPage() {
  const [snapshot, setSnapshot] = useState<ReconciliationSnapshot | null>(null);
  const [allRows, setAllRows] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const payload = await getReconciliationSnapshot();
      const normalizedRows = toRowsArray(payload).map(normalizeSnapshotRow);

      setSnapshot(payload);
      setAllRows(normalizedRows);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setSnapshot(null);
        setAllRows([]);
      }
    } finally {
      if (mode === "initial") {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const flaggedRows = useMemo(
    () => allRows.filter((row) => row.flagged),
    [allRows]
  );

  const checkedCount = useMemo(() => {
    const objectSnapshot = toObject(snapshot);
    const payloadChecked = toNumber(
      objectSnapshot?.checked_count ?? objectSnapshot?.checkedCount
    );

    return payloadChecked > 0 ? payloadChecked : allRows.length;
  }, [snapshot, allRows.length]);

  const flaggedCount = useMemo(() => {
    const objectSnapshot = toObject(snapshot);
    const payloadFlagged = toNumber(
      objectSnapshot?.flagged_count ?? objectSnapshot?.flaggedCount
    );

    return payloadFlagged > 0 ? payloadFlagged : flaggedRows.length;
  }, [snapshot, flaggedRows.length]);

  const totalDelta = useMemo(
    () => flaggedRows.reduce((sum, row) => sum + Math.abs(toNumber(row.delta)), 0),
    [flaggedRows]
  );

  const totalPendingOutstanding = useMemo(
    () =>
      flaggedRows.reduce(
        (sum, row) => sum + toNumber(row.pending_outstanding),
        0
      ),
    [flaggedRows]
  );

  const totalComputedOutstanding = useMemo(
    () =>
      flaggedRows.reduce(
        (sum, row) => sum + toNumber(row.computed_outstanding),
        0
      ),
    [flaggedRows]
  );

  const exportRows = useMemo(
    () =>
      flaggedRows.map((row) => ({
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
    [flaggedRows]
  );

  return (
    <PortalPage
      title="Reconciliation Dashboard"
      subtitle="Portfolio-level financial consistency view for subscription balances, outstanding computation, and mismatch attention."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Reconciliation" },
      ]}
      actions={[
        {
          href: "/admin/payments/reconciliation",
          label: "Payment Reconciliation",
          variant: "secondary",
        },
        {
          href: "/admin/payments",
          label: "Open Payments",
          variant: "primary",
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
          label: "Pending Outstanding",
          value: money(totalPendingOutstanding),
        },
        {
          label: "Delta Exposure",
          value: money(totalDelta),
          tone: totalDelta > 0 ? "danger" : undefined,
        },
      ]}
      statusBadge={{
        label: "Portfolio Integrity",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end gap-3">
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
            disabled={exportRows.length === 0 || loading}
            onClick={() =>
              downloadCsv(
                "reconciliation-dashboard-current-view.csv",
                [
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
                exportRows
              )
            }
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export Current View
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading reconciliation dashboard..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load reconciliation dashboard"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <SectionCard
              title="Reconciliation Note"
              description="This page shows only subscription rows that are actually mismatched. Use payment reconciliation when you need payment-specific reconciliation actions."
            >
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Snapshot Rows
                  </div>
                  <div className="mt-2 text-xl font-semibold text-foreground">
                    {String(checkedCount)}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Filtered subscriptions reviewed in the current reconciliation snapshot.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Flagged Mismatches
                  </div>
                  <div className="mt-2 text-xl font-semibold text-foreground">
                    {String(flaggedCount)}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Subscription rows where computed and pending outstanding do not align.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Computed Outstanding
                  </div>
                  <div className="mt-2 text-xl font-semibold text-foreground">
                    {money(totalComputedOutstanding)}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Sum of system-computed outstanding values across flagged rows.
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Flagged Subscription Rows"
              description="Only mismatched subscription rows are shown below so the page matches the dashboard attention count."
            >
              {flaggedRows.length === 0 ? (
                <EmptyState
                  title="No reconciliation mismatches"
                  description="No subscription-level reconciliation mismatches are currently flagged."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Subscription
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Customer
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Contract
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Outstanding
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Delta
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {flaggedRows.map((row) => (
                        <tr key={row.subscription_id} className="align-top">
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.subscription_number || `SUB-${row.subscription_id}`}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Subscription ID {row.subscription_id}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.customer_name || "Unknown customer"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            <div>Total {money(row.total_amount)}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Paid {money(row.paid_amount)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Waived {money(row.waived_amount)}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            <div>Pending {money(row.pending_outstanding)}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Computed {money(row.computed_outstanding)}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-foreground">
                            {money(row.delta)}
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="flex flex-col items-start gap-2">
                              <Link
                                href={`/admin/subscriptions/${row.subscription_id}`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Subscription
                              </Link>

                              <Link
                                href={`/admin/payments/reconciliation?subscription=${row.subscription_id}`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Payment Reconciliation
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}