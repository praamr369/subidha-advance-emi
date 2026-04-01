"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import { downloadAuthenticatedFile } from "@/lib/export/auth-download";
import {
  getPartnerDashboard,
  getPartnerEarningsExportPath,
  getPartnerEarningsSummary,
  type PartnerDashboardResponse,
  type PartnerEarningsSummary,
} from "@/services/partner";

type TrendRow = {
  id: string;
  period: string;
  sort_key: string;
  collected_amount: string;
  commission_amount: string;
};

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function moneyValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return money(value);
}

function metricValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return String(value);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner reports.";
}

function formatPeriod(year?: number | null, month?: number | null): string {
  if (!year || !month) return "Unknown period";
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

export default function PartnerReportsPage() {
  const [dashboard, setDashboard] = useState<PartnerDashboardResponse | null>(null);
  const [earnings, setEarnings] = useState<PartnerEarningsSummary | null>(null);
  const [statementStatus, setStatementStatus] = useState<
    "" | "PENDING" | "SETTLED" | "REVERSED"
  >("");
  const [statementDateFrom, setStatementDateFrom] = useState("");
  const [statementDateTo, setStatementDateTo] = useState("");
  const [exportingFormat, setExportingFormat] = useState<"csv" | "pdf" | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [dashboardPayload, earningsPayload] = await Promise.all([
        getPartnerDashboard(),
        getPartnerEarningsSummary(),
      ]);
      setDashboard(dashboardPayload);
      setEarnings(earningsPayload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setDashboard(null);
      setEarnings(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const summary = dashboard?.summary;

  const trendRows = useMemo<TrendRow[]>(() => {
    const grouped = new Map<string, TrendRow>();

    for (const row of earnings?.monthly_collection ?? []) {
      const period = formatPeriod(row.payment_date__year, row.payment_date__month);
      const sortKey = `${String(row.payment_date__year ?? 0).padStart(4, "0")}-${String(
        row.payment_date__month ?? 0
      ).padStart(2, "0")}`;
      grouped.set(period, {
        id: period,
        period,
        sort_key: sortKey,
        collected_amount: typeof row.total === "string" ? row.total : String(row.total),
        commission_amount: "0.00",
      });
    }

    for (const row of earnings?.monthly_commission ?? []) {
      const period = formatPeriod(row.created_at__year, row.created_at__month);
      const sortKey = `${String(row.created_at__year ?? 0).padStart(4, "0")}-${String(
        row.created_at__month ?? 0
      ).padStart(2, "0")}`;
      const existing = grouped.get(period);
      if (existing) {
        existing.commission_amount =
          typeof row.total === "string" ? row.total : String(row.total);
      } else {
        grouped.set(period, {
          id: period,
          period,
          sort_key: sortKey,
          collected_amount: "0.00",
          commission_amount: typeof row.total === "string" ? row.total : String(row.total),
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => a.sort_key.localeCompare(b.sort_key));
  }, [earnings]);

  async function handleExport(format: "csv" | "pdf") {
    setExportingFormat(format);
    setError(null);

    try {
      await downloadAuthenticatedFile(
        getPartnerEarningsExportPath({
          status: statementStatus || undefined,
          date_from: statementDateFrom || undefined,
          date_to: statementDateTo || undefined,
          export_format: format,
        }),
        `partner-earnings-statement.${format}`
      );
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <PortalPage
      title="Partner Reports"
      subtitle="Partner-scoped collection and commission report truth sourced from the live earnings and dashboard endpoints."
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Reports" },
      ]}
      actions={[
        {
          href: "/partner/payments",
          label: "Open Payments",
          variant: "secondary",
        },
        {
          href: "/partner/commissions",
          label: "Open Commissions",
          variant: "primary",
        },
      ]}
      stats={[
        {
          label: "Collected",
          value: moneyValue(earnings?.total_collected),
          tone: "success",
        },
        {
          label: "Total Commission",
          value: moneyValue(earnings?.total_commission),
        },
        {
          label: "Pending Commission",
          value: moneyValue(earnings?.pending_commission),
          tone: "warning",
        },
        {
          label: "Settled Commission",
          value: moneyValue(earnings?.settled_commission),
        },
      ]}
      statusBadge={{ label: "Partner Report Truth", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading ? <LoadingBlock label="Loading partner reports..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load partner reports"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && dashboard && earnings ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total Customers
                </div>
                <div className="mt-2 text-xl font-semibold text-foreground">
                  {metricValue(summary?.total_customers)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Partner-linked customer scope only
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total Subscriptions
                </div>
                <div className="mt-2 text-xl font-semibold text-foreground">
                  {metricValue(summary?.total_subscriptions)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Active, completed, won, and defaulted contracts
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pending EMIs
                </div>
                <div className="mt-2 text-xl font-semibold text-foreground">
                  {metricValue(summary?.pending_emis)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Current partner-scoped pending schedule rows
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Waived EMIs
                </div>
                <div className="mt-2 text-xl font-semibold text-foreground">
                  {metricValue(summary?.waived_emis)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Waiver impact inside partner-owned subscriptions
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Earnings Statement Export
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Export your own commission statement as CSV or PDF using partner-scoped backend truth only.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Status
                    </label>
                    <select
                      value={statementStatus}
                      onChange={(event) =>
                        setStatementStatus(
                          event.target.value as "" | "PENDING" | "SETTLED" | "REVERSED"
                        )
                      }
                      className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                    >
                      <option value="">All</option>
                      <option value="PENDING">Pending</option>
                      <option value="SETTLED">Settled</option>
                      <option value="REVERSED">Reversed</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      From
                    </label>
                    <input
                      type="date"
                      value={statementDateFrom}
                      onChange={(event) => setStatementDateFrom(event.target.value)}
                      className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      To
                    </label>
                    <input
                      type="date"
                      value={statementDateTo}
                      onChange={(event) => setStatementDateTo(event.target.value)}
                      className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                    />
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <button
                      type="button"
                      onClick={() => void handleExport("csv")}
                      disabled={exportingFormat !== null}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {exportingFormat === "csv" ? "Exporting..." : "CSV"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExport("pdf")}
                      disabled={exportingFormat !== null}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {exportingFormat === "pdf" ? "Exporting..." : "PDF"}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Monthly Collection And Commission Trend
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Report rows below come from the partner earnings endpoint only, not from synthetic frontend rollups.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/partner/payments"
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Payments
                  </Link>
                  <Link
                    href="/partner/commissions"
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Commissions
                  </Link>
                </div>
              </div>

              <div className="mt-4">
                {trendRows.length === 0 ? (
                  <EmptyState
                    title="No report rows yet"
                    description="No partner-scoped collection or commission history is currently available."
                  />
                ) : (
                  <DataTable<TrendRow>
                    rows={trendRows}
                    emptyText="No partner report rows."
                    columns={[
                      { key: "period", title: "Period" },
                      {
                        key: "collected_amount",
                        title: "Collected",
                        render: (row) => moneyValue(row.collected_amount),
                      },
                      {
                        key: "commission_amount",
                        title: "Commission",
                        render: (row) => moneyValue(row.commission_amount),
                      },
                    ]}
                  />
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
