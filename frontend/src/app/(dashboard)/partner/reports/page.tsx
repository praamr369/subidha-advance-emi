"use client";
import { formatRupee } from "@/lib/utils/currency";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Download, FileText, IndianRupee, Clock, TrendingUp } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
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

function moneyValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return formatRupee(value);
}

function metricValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return String(value);
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
  const [statementStatus, setStatementStatus] = useState<"" | "PENDING" | "SETTLED" | "REVERSED">("");
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
      setError(err instanceof Error ? err.message : "Failed to load partner reports.");
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
      setExportError(err instanceof Error ? err.message : "Failed to export.");
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <div className="flex flex-col p-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Collection and commission report
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadPage("refresh")}
          disabled={refreshing}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <LoadingBlock label="Loading reports..." />
      ) : error ? (
        <ErrorState title="Error" description={error} onRetry={() => void loadPage("initial")} />
      ) : !dashboard || !earnings ? (
        <EmptyState
          title="No data"
          description="Partner report sources are currently empty for this scope."
        />
      ) : (
        <>
          {/* Main Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex size-8 items-center justify-center rounded-full bg-success/10 text-success mb-2">
                <IndianRupee className="size-4" />
              </div>
              <div className="text-sm font-medium text-muted-foreground">Collected</div>
              <div className="text-lg font-bold text-foreground">{moneyValue(earnings?.total_collected)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                <TrendingUp className="size-4" />
              </div>
              <div className="text-sm font-medium text-muted-foreground">Commission</div>
              <div className="text-lg font-bold text-foreground">{moneyValue(earnings?.total_commission)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex size-8 items-center justify-center rounded-full bg-warning/10 text-warning mb-2">
                <Clock className="size-4" />
              </div>
              <div className="text-sm font-medium text-muted-foreground">Pending</div>
              <div className="text-lg font-bold text-foreground">{moneyValue(earnings?.pending_commission)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex size-8 items-center justify-center rounded-full bg-info/10 text-info mb-2">
                <FileText className="size-4" />
              </div>
              <div className="text-sm font-medium text-muted-foreground">Settled</div>
              <div className="text-lg font-bold text-foreground">{moneyValue(earnings?.settled_commission)}</div>
            </div>
          </div>

          {/* Operational summary */}
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Operational Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center rounded-2xl border border-border bg-card p-4 shadow-sm">
                <span className="text-sm font-medium text-muted-foreground">Total Customers</span>
                <span className="font-bold text-foreground">{metricValue(summary?.total_customers)}</span>
              </div>
              <div className="flex justify-between items-center rounded-2xl border border-border bg-card p-4 shadow-sm">
                <span className="text-sm font-medium text-muted-foreground">Total Subscriptions</span>
                <span className="font-bold text-foreground">{metricValue(summary?.total_subscriptions)}</span>
              </div>
              <div className="flex justify-between items-center rounded-2xl border border-border bg-card p-4 shadow-sm">
                <span className="text-sm font-medium text-muted-foreground">Pending EMIs</span>
                <span className="font-bold text-warning">{metricValue(summary?.pending_emis)}</span>
              </div>
            </div>
          </div>

          {/* Export Statement */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Export Statement</h2>
            {exportError && <div className="text-xs text-danger">{exportError}</div>}
            <div className="space-y-3">
              <select
                value={statementStatus}
                onChange={(e) => setStatementStatus(e.target.value as any)}
                className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="SETTLED">Settled</option>
                <option value="REVERSED">Reversed</option>
              </select>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={statementDateFrom}
                  onChange={(e) => setStatementDateFrom(e.target.value)}
                  className="h-12 flex-1 rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <input
                  type="date"
                  value={statementDateTo}
                  onChange={(e) => setStatementDateTo(e.target.value)}
                  className="h-12 flex-1 rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void handleExport("csv")}
                  disabled={exportingFormat !== null}
                  className="h-12 flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground active:scale-95 transition disabled:opacity-50"
                >
                  <Download className="size-4" /> CSV
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport("pdf")}
                  disabled={exportingFormat !== null}
                  className="h-12 flex-1 flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-bold text-foreground active:scale-95 transition disabled:opacity-50"
                >
                  <Download className="size-4" /> PDF
                </button>
              </div>
            </div>
          </div>

          {/* Trend rows */}
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Monthly Trends</h2>
            {trendRows.length === 0 ? (
              <EmptyState title="No trend data" description="No collection or commission history available." />
            ) : (
              <div className="space-y-3">
                {trendRows.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-2">
                    <div className="font-bold text-foreground border-b border-border pb-2 mb-1">{row.period}</div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground font-medium">Collected</span>
                      <span className="text-sm font-bold">{moneyValue(row.collected_amount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground font-medium">Commission</span>
                      <span className="text-sm font-bold text-primary">{moneyValue(row.commission_amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
