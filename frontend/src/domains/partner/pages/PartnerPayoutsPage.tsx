"use client";

import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import { TableSkeleton } from "@/components/feedback/Skeleton";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import {
  DataTableShell,
  DetailPanel,
  KpiCard,
  MobileSafeTable,
  QuickActionGrid,
  WorkflowCard,
} from "@/components/ui/operations";
import {
  listPartnerCommissions,
  listPartnerSubscriptions,
  type PartnerCommission,
  type PartnerCommissionListSummary,
  type PartnerSubscription,
} from "@/services/partner";

function money(value?: string | number | null): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load commission visibility.";
}

function commissionAmount(row: PartnerCommission): number {
  const parsed = Number(row.commission_amount ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSettled(status?: string | null): boolean {
  const token = String(status || "").toUpperCase();
  return token === "PAID" || token === "SETTLED";
}

type PartnerCommissionFilters = {
  status: string;
  date_from: string;
  date_to: string;
  q: string;
};

const EMPTY_FILTERS: PartnerCommissionFilters = {
  status: "",
  date_from: "",
  date_to: "",
  q: "",
};

export default function PartnerPayoutsPage({
  mode = "payouts",
}: {
  mode?: "payouts" | "commissions";
}) {
  const [rows, setRows] = useState<PartnerCommission[]>([]);
  const [subscriptionIndex, setSubscriptionIndex] = useState<Record<number, PartnerSubscription>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PartnerCommissionListSummary | null>(null);
  const [filters, setFilters] = useState<PartnerCommissionFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<PartnerCommissionFilters>(EMPTY_FILTERS);

  const loadPage = useCallback(
    async (loadMode: "initial" | "refresh" = "initial") => {
      if (loadMode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const [commissionPayload, subscriptionPayload] = await Promise.all([
          listPartnerCommissions({
            status: filters.status.trim() || undefined,
            date_from: filters.date_from.trim() || undefined,
            date_to: filters.date_to.trim() || undefined,
            q: filters.q.trim() || undefined,
          }),
          listPartnerSubscriptions(),
        ]);
        setRows(commissionPayload.results);
        setSummary(commissionPayload.summary);
        const mapped: Record<number, PartnerSubscription> = {};
        for (const sub of subscriptionPayload.results || []) {
          mapped[sub.id] = sub;
        }
        setSubscriptionIndex(mapped);
        setError(null);
      } catch (err) {
        setRows([]);
        setSubscriptionIndex({});
        setSummary(null);
        setError(normalizeError(err));
      } finally {
        if (loadMode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [filters],
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const pendingAmount = useMemo(
    () =>
      rows
        .filter((row) => !isSettled(row.status))
        .reduce((sum, row) => sum + commissionAmount(row), 0),
    [rows],
  );

  const settledAmount = useMemo(
    () =>
      rows
        .filter((row) => isSettled(row.status))
        .reduce((sum, row) => sum + commissionAmount(row), 0),
    [rows],
  );

  const pendingDisplay = summary ? Number(summary.pending_commission) : pendingAmount;
  const settledDisplay = summary ? Number(summary.settled_commission) : settledAmount;

  const latestCreatedAt = rows[0]?.created_at ?? null;

  const clearFilterField = useCallback((field: keyof PartnerCommissionFilters) => {
    setFilters((prev) => ({ ...prev, [field]: "" }));
    setDraftFilters((prev) => ({ ...prev, [field]: "" }));
  }, []);

  const activeFilterTokens = useMemo(() => {
    const chips: Array<{ field: keyof PartnerCommissionFilters; label: string }> = [];
    if (filters.status.trim()) {
      chips.push({
        field: "status",
        label: `Status · ${filters.status.trim()}`,
      });
    }
    if (filters.date_from.trim()) {
      chips.push({
        field: "date_from",
        label: `From · ${filters.date_from.trim()}`,
      });
    }
    if (filters.date_to.trim()) {
      chips.push({
        field: "date_to",
        label: `To · ${filters.date_to.trim()}`,
      });
    }
    if (filters.q.trim()) {
      chips.push({
        field: "q",
        label: `Search · ${filters.q.trim()}`,
      });
    }
    return chips;
  }, [filters]);

  const columns = useMemo<Column<PartnerCommission>[]>(
    () => [
      {
        key: "id",
        title: "Subscription / Customer",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              {row.subscription ? `SUB-${row.subscription}` : `#${row.id}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.subscription
                ? subscriptionIndex[row.subscription]?.customer_name || "Customer unavailable"
                : "Subscription unavailable"}
            </div>
          </div>
        ),
      },
      {
        key: "emi",
        title: "EMI Paid / Winner",
        render: (row) => {
          const sub = row.subscription ? subscriptionIndex[row.subscription] : undefined;
          return (
            <div className="space-y-1">
              <div className="text-sm text-foreground">
                EMI {row.emi ? `#${row.emi}` : "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                Paid EMI {sub?.paid_emi_count ?? "—"}
              </div>
              {sub?.winner_status ? (
                <StatusBadge status={sub.winner_status} hideIcon />
              ) : (
                <span className="text-xs text-muted-foreground">Winner status unavailable</span>
              )}
            </div>
          );
        },
      },
      {
        key: "commission_amount",
        title: "Commission Earned",
        align: "right",
        render: (row) => money(row.commission_amount),
      },
      {
        key: "status",
        title: "Payout Status",
        render: (row) => <StatusBadge status={row.status || "PENDING"} />,
      },
      {
        key: "created_at",
        title: "Created",
        render: (row) => formatDateTime(row.created_at),
      },
      {
        key: "paid_at",
        title: "Settled",
        render: (row) => formatDateTime(row.paid_at || row.approved_at),
      },
    ],
    [subscriptionIndex],
  );

  const title = mode === "commissions" ? "Commission Ledger" : "Payout Visibility";
  const subtitle =
    mode === "commissions"
      ? "Partner-scoped commission entries with earned, pending, and settled visibility."
      : "Partner-scoped payout visibility derived from live commission entries without exposing admin payout controls.";

  const emptyFilterExplanation =
    activeFilterTokens.length > 0
      ? `No commission rows matched ${activeFilterTokens.map((item) => item.label).join(" · ")}. Clear filters or widen the date range.`
      : mode === "commissions"
        ? "When customers pay EMIs tied to your partner scope, earned commissions appear here with pending or settled payout status."
        : "No commission or payout visibility rows are currently available in this partner scope.";

  return (
    <PortalPage
      eyebrow="Partner Earnings"
      title={title}
      subtitle={subtitle}
      helperNote="This page is visibility-only for partners. Payout finalization, finance-account posting, and reconciliation remain controlled admin workflows."
      helperTone="info"
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: mode === "commissions" ? "Commissions" : "Payouts" },
      ]}
      actions={[
        {
          href: "/partner/payments",
          label: "Payments",
          variant: "secondary",
        },
        {
          href: "/partner/collections",
          label: "Collections",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Entries", value: loading ? "…" : String(rows.length) },
        {
          label: "Pending amount",
          value: loading ? "…" : money(pendingDisplay),
          tone: pendingDisplay > 0 ? "warning" : "default",
        },
        {
          label: "Settled amount",
          value: loading ? "…" : money(settledDisplay),
          tone: settledDisplay > 0 ? "success" : "default",
        },
        {
          label: "Latest entry",
          value: loading ? "…" : formatDateTime(latestCreatedAt),
        },
      ]}
      statusBadge={{ label: "Partner visibility", tone: "info" }}
    >
      <div className="space-y-6">
        <DetailPanel
          title="Payout boundary"
          description="Commission is payment-based and visibility here does not authorize payout posting."
        >
          <WorkflowCard
            title="Refresh payout visibility"
            description="Reload current partner commission rows and linked subscription winner state."
            action={
              <ActionButton
                variant="outline"
                onClick={() => void loadPage("refresh")}
                disabled={loading || refreshing}
                leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </ActionButton>
            }
          />
        </DetailPanel>

        <div data-testid="partner-commission-filters">
        <DetailPanel
          title="Filters"
          description="Filter your own commission ledger by lifecycle status, creation date range, or subscription identifiers visible to partners."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">Status</span>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                value={draftFilters.status}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                <option value="">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="SETTLED">Settled</option>
                <option value="REVERSED">Reversed</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">Created from</span>
              <input
                type="date"
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                value={draftFilters.date_from}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, date_from: event.target.value }))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">Created to</span>
              <input
                type="date"
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                value={draftFilters.date_to}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, date_to: event.target.value }))
                }
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2 xl:col-span-1">
              <span className="font-medium text-foreground">Search</span>
              <input
                type="search"
                placeholder="Subscription number or customer hint"
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                value={draftFilters.q}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, q: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton variant="primary" onClick={() => setFilters(draftFilters)}>
              Apply filters
            </ActionButton>
            <ActionButton
              variant="outline"
              onClick={() => {
                setDraftFilters(EMPTY_FILTERS);
                setFilters(EMPTY_FILTERS);
              }}
            >
              Clear filters
            </ActionButton>
          </div>
          {activeFilterTokens.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {activeFilterTokens.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-foreground"
                  onClick={() => clearFilterField(chip.field)}
                >
                  {chip.label}
                  <X className="h-3 w-3" aria-hidden />
                </button>
              ))}
            </div>
          ) : null}
        </DetailPanel>
        </div>

        <QuickActionGrid>
          <KpiCard label="Commission Entries" value={loading ? "…" : rows.length} />
          <KpiCard
            label="Pending Payout"
            value={loading ? "…" : money(pendingDisplay)}
            helper="Awaiting settlement approval"
          />
          <KpiCard
            label="Settled Payout"
            value={loading ? "…" : money(settledDisplay)}
            helper="Settled based on payment-backed commissions"
          />
          <KpiCard label="Latest Entry" value={loading ? "…" : formatDateTime(latestCreatedAt)} />
        </QuickActionGrid>

        {loading ? (
          <section aria-busy="true" aria-label="Loading commission entries">
            <TableSkeleton rows={8} columns={6} />
          </section>
        ) : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load payout visibility"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <DetailPanel
            title="Commission and payout entries"
            description="Live partner-visible entries; winner status appears only when linked subscription data is available."
          >
            {rows.length === 0 ? (
              <EmptyState title="No commission entries found" description={emptyFilterExplanation} />
            ) : (
              <DataTableShell>
                <MobileSafeTable className="border-none bg-transparent">
                  <DataTable<PartnerCommission>
                    rows={rows}
                    columns={columns}
                    rowActions={(row) =>
                      row.subscription ? (
                        <ActionButton
                          href={`/partner/subscriptions/${row.subscription}`}
                          variant="outline"
                          className="min-h-11"
                        >
                          Subscription
                        </ActionButton>
                      ) : null
                    }
                  />
                </MobileSafeTable>
              </DataTableShell>
            )}
          </DetailPanel>
        ) : null}
      </div>
    </PortalPage>
  );
}
