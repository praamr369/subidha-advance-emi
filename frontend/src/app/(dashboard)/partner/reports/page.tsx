"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { MobileSafeTable } from "@/components/ui/operations";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { WorkspaceSection } from "@/components/ui/workspace";
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
  const [exportError, setExportError] = useState<string | null>(null);

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

    return Array.from(grouped.values()).sort((a, b) => b.sort_key.localeCompare(a.sort_key));
  }, [earnings]);

  const selectedRangeLabel = useMemo(() => {
    if (statementDateFrom && statementDateTo) {
      return `${statementDateFrom} → ${statementDateTo}`;
    }
    if (statementDateFrom) return `From ${statementDateFrom}`;
    if (statementDateTo) return `Until ${statementDateTo}`;
    return "All dates";
  }, [statementDateFrom, statementDateTo]);

  function clearStatementFilters() {
    setStatementStatus("");
    setStatementDateFrom("");
    setStatementDateTo("");
  }

  async function handleExport(format: "csv" | "pdf") {
    setExportingFormat(format);
    setExportError(null);

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
      setExportError(toErrorMessage(err));
    } finally {
      setExportingFormat(null);
    }
  }

  const trendColumns = useMemo<Column<TrendRow>[]>(
    () => [
      { key: "period", title: "Period" },
      {
        key: "collected_amount",
        title: "Collected",
        align: "right",
        render: (row) => moneyValue(row.collected_amount),
      },
      {
        key: "commission_amount",
        title: "Commission",
        align: "right",
        render: (row) => moneyValue(row.commission_amount),
      },
    ],
    []
  );

  return (
    <ERPPageShell
      eyebrow="Partner Reports"
      title="Partner Reports"
      subtitle="Partner-scoped collection and commission report truth sourced from the live earnings and dashboard endpoints."
      helperNote="This workspace reports only live partner-scoped data already exposed by the backend. It does not fabricate analytics or expose admin-only finance controls."
      helperTone="info"
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
        {
          label: "Latest period",
          value: trendRows[0]?.period || "—",
        },
      ]}
      statusBadge={{ label: "Partner Report Truth", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <ActionButton
            type="button"
            variant="outline"
            onClick={() => void loadPage("refresh")}
            leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </ActionButton>
        </div>

        {loading ? <ERPLoadingState label="Loading partner reports..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load partner reports"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && (!dashboard || !earnings) ? (
          <ERPEmptyState
            title="No partner report data"
            description="Partner report sources are currently empty for this scope."
          />
        ) : null}

        {!loading && !error && dashboard && earnings ? (
          <>
            <WorkspaceSection
              title="Reporting boundary"
              description="Partner reports stay grounded in live dashboard and earnings endpoints only."
            >
              <WorkspaceNotice tone="info" title="No synthetic analytics">
                Customer counts, subscription counts, pending EMI totals, collection totals, commission totals, and exported statements on this page all come from existing partner endpoints. No frontend-only rollups are introduced here.
              </WorkspaceNotice>
            </WorkspaceSection>

            <WorkspaceSection
              title="Operational summary"
              description="Current partner-visible counts that support day-to-day reporting and follow-up."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Total Customers"
                  value={metricValue(summary?.total_customers)}
                  subtext="Partner-linked customer scope only"
                />
                <StatCard
                  label="Total Subscriptions"
                  value={metricValue(summary?.total_subscriptions)}
                  subtext="Active, completed, won, and defaulted contracts"
                />
                <StatCard
                  label="Pending EMIs"
                  value={metricValue(summary?.pending_emis)}
                  subtext="Current partner-scoped pending schedule rows"
                  tone="warning"
                />
                <StatCard
                  label="Waived EMIs"
                  value={metricValue(summary?.waived_emis)}
                  subtext="Waiver impact inside partner-owned subscriptions"
                  tone="info"
                />
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Earnings statement export"
              description="Export partner-scoped commission visibility as CSV or PDF using the existing earnings export endpoint."
            >
              {exportError ? (
                <div className="mb-4">
                  <WorkspaceNotice tone="danger" title="Unable to export statement">
                    {exportError}
                  </WorkspaceNotice>
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
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
                    className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
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
                    className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
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
                    className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <ActionButton
                    type="button"
                    variant="ghost"
                    onClick={clearStatementFilters}
                    disabled={exportingFormat !== null}
                  >
                    Clear filters
                  </ActionButton>
                  <ActionButton
                    type="button"
                    variant="outline"
                    onClick={() => void handleExport("csv")}
                    disabled={exportingFormat !== null}
                    loading={exportingFormat === "csv"}
                  >
                    {exportingFormat === "csv" ? "Exporting..." : "CSV"}
                  </ActionButton>
                  <ActionButton
                    type="button"
                    onClick={() => void handleExport("pdf")}
                    disabled={exportingFormat !== null}
                    loading={exportingFormat === "pdf"}
                  >
                    {exportingFormat === "pdf" ? "Exporting..." : "PDF"}
                  </ActionButton>
                </div>
              </div>

              <div className="mt-4">
                <WorkspaceNotice tone="default" title="Current export scope">
                  Status: {statementStatus || "All"} · Date range: {selectedRangeLabel}
                </WorkspaceNotice>
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Monthly collection and commission trend"
              description="Trend rows below come directly from the partner earnings endpoint and provide route-safe drill-in to payments and commissions."
              action={
                <div className="flex flex-wrap gap-2">
                  <ActionButton href="/partner/payments" variant="outline">
                    Payments
                  </ActionButton>
                  <ActionButton href="/partner/commissions" variant="ghost">
                    Commissions
                  </ActionButton>
                </div>
              }
            >
              {trendRows.length === 0 ? (
                <ERPEmptyState
                  title="No report rows yet"
                  description="No partner-scoped collection or commission history is currently available."
                />
              ) : (
                <MobileSafeTable className="border-none bg-transparent">
                  <DataTable<TrendRow>
                    rows={trendRows}
                    emptyText="No partner report rows."
                    columns={trendColumns}
                    pageSize={12}
                  />
                </MobileSafeTable>
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
