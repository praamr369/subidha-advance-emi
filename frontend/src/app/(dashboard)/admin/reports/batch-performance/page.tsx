"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Gift, RefreshCw, Trophy, Users } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable from "@/components/ui/DataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import StatCard from "@/components/ui/StatCard";
import TableToolbar from "@/components/ui/TableToolbar";
import { WorkspaceSection } from "@/components/ui/workspace";
import { downloadCsv } from "@/lib/export/csv";
import { getBatchPerformanceSummary } from "@/services/reports";

type BatchPerformanceRow = {
  id: number;
  batchId: number;
  batchCode: string;
  subscriptionCount: number;
  activeSubscriptionCount: number;
  wonCount: number;
  drawCount: number;
  winRate: number;
  available_lucky_ids: number;
  assigned_lucky_ids: number;
  won_lucky_ids: number;
  monthly_booked_value: string;
};

function money(value: string | number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load batch performance.";
}

export default function BatchPerformanceReportPage() {
  const [rows, setRows] = useState<BatchPerformanceRow[]>([]);
  const [accuracyNote, setAccuracyNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await getBatchPerformanceSummary();
        setRows(
          payload.rows.map((item) => ({
            ...item,
            id: item.batchId,
            available_lucky_ids: item.available_lucky_ids,
            assigned_lucky_ids: item.assigned_lucky_ids,
            won_lucky_ids: item.won_lucky_ids,
            monthly_booked_value: item.monthly_booked_value,
          }))
        );
        setAccuracyNote(payload.accuracy.note);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        setRows([]);
        setAccuracyNote("");
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const totals = useMemo(() => {
    const totalSubscriptions = rows.reduce(
      (sum, row) => sum + row.subscriptionCount,
      0
    );
    const totalActive = rows.reduce(
      (sum, row) => sum + row.activeSubscriptionCount,
      0
    );
    const totalWinners = rows.reduce((sum, row) => sum + row.wonCount, 0);
    const totalDraws = rows.reduce((sum, row) => sum + row.drawCount, 0);
    const totalBooked = rows.reduce(
      (sum, row) => sum + Number(row.monthly_booked_value || 0),
      0
    );

    return {
      totalSubscriptions,
      totalActive,
      totalWinners,
      totalDraws,
      totalBooked,
      averageWinRate:
        rows.length > 0
          ? rows.reduce((sum, row) => sum + row.winRate, 0) / rows.length
          : 0,
    };
  }, [rows]);

  return (
    <ERPPageShell
      title="Batch Performance"
      subtitle="Operational draw, enrollment, and Lucky ID progression by batch using live per-batch summary endpoints."
      headerMode="erp"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Reports", href: "/admin/reports" },
        { label: "Batch Performance" },
      ]}
      actions={[
        {
          href: "/admin/reports",
          label: "Back to Reports",
          variant: "secondary",
        },
        {
          href: "/admin/batches",
          label: "Open Batches Register",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Batch Rows",
          value: String(rows.length),
        },
        {
          label: "Subscriptions",
          value: String(totals.totalSubscriptions),
        },
        {
          label: "Draws",
          value: String(totals.totalDraws),
        },
        {
          label: "Winner Contracts",
          value: String(totals.totalWinners),
          tone: totals.totalWinners > 0 ? "info" : "default",
        },
      ]}
      statusBadge={{ label: "Source-linked report", tone: "info" }}
      helperNote="Read-only BI. Decision support only — no posting from this page. Drill down to Lucky Plan Control to take action on a batch."
      helperTone="info"
    >
      <div className="space-y-6">
        <TableToolbar
          footer={
            <p className="text-sm text-muted-foreground">
              {accuracyNote ||
                "Batch performance rows are computed from live per-batch summary endpoints."}
            </p>
          }
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">
                Current report view
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Compare draw activity, winner count, and Lucky ID allocation without leaving the report workspace.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                disabled={loading || refreshing}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className="h-4 w-4" />
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                disabled={rows.length === 0}
                onClick={() =>
                  downloadCsv(
                    "batch-performance-current-view.csv",
                    [
                      { key: "batchCode", header: "batch_code" },
                      { key: "subscriptionCount", header: "subscription_count" },
                      { key: "drawCount", header: "draw_count" },
                      { key: "wonCount", header: "won_count" },
                      {
                        key: "winRate",
                        header: "win_rate_percent",
                        format: (row) => row.winRate.toFixed(2),
                      },
                    ],
                    rows
                  )
                }
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Export Current View
              </button>
            </div>
          </div>
        </TableToolbar>

        {loading ? <LoadingBlock label="Loading batch performance..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load batch performance"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Active Contracts"
                value={String(totals.totalActive)}
                subtext="Active subscriptions across visible batches"
                icon={<Users className="h-4 w-4" />}
              />
              <StatCard
                label="Booked Monthly Value"
                value={money(totals.totalBooked)}
                subtext="Visible monthly booked value"
                tone="success"
                icon={<Boxes className="h-4 w-4" />}
              />
              <StatCard
                label="Average Win Rate"
                value={`${totals.averageWinRate.toFixed(1)}%`}
                subtext="Average of visible batch rows"
                tone="info"
                icon={<Trophy className="h-4 w-4" />}
              />
              <StatCard
                label="Winner Contracts"
                value={String(totals.totalWinners)}
                subtext="Visible won subscriptions"
                tone={totals.totalWinners > 0 ? "info" : "default"}
                icon={<Gift className="h-4 w-4" />}
              />
            </div>

            <WorkspaceSection
              title="Batch drill-down"
              description="Open a batch directly from the report when draw pressure, Lucky ID allocation, or winner progression needs attention."
            >
              {rows.length === 0 ? (
                <EmptyState
                  title="No batch performance records found"
                  description="There are no batch performance rows in the current report view."
                />
              ) : (
                <DataTable<BatchPerformanceRow>
                  rows={rows}
                  error={error}
                  emptyText="No batch performance records found."
                  columns={[
                    {
                      key: "batchCode",
                      title: "Batch",
                      render: (row) => (
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">
                            {row.batchCode}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Batch #{row.batchId}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "subscriptionCount",
                      title: "Subscriptions",
                      render: (row) => (
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">
                            {row.subscriptionCount}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Active {row.activeSubscriptionCount}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "available_lucky_ids",
                      title: "Lucky IDs",
                      render: (row) => (
                        <div className="space-y-1 text-sm">
                          <div className="text-foreground">
                            Available {row.available_lucky_ids}
                          </div>
                          <div className="text-muted-foreground">
                            Assigned {row.assigned_lucky_ids} · Won {row.won_lucky_ids}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "drawCount",
                      title: "Draws / Winners",
                      render: (row) => (
                        <div className="space-y-1 text-sm">
                          <div className="text-foreground">Draws {row.drawCount}</div>
                          <div className="text-muted-foreground">
                            Winners {row.wonCount}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "monthly_booked_value",
                      title: "Booked Value",
                      align: "right",
                      render: (row) => money(row.monthly_booked_value),
                    },
                    {
                      key: "winRate",
                      title: "Win Rate",
                      align: "right",
                      render: (row) => `${row.winRate.toFixed(1)}%`,
                    },
                  ]}
                  rowActions={(row) => (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/batches/${row.batchId}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        View in Lucky Plan
                      </Link>
                    </div>
                  )}
                />
              )}
            </WorkspaceSection>
          </>
        )}
      </div>
    </ERPPageShell>
  );
}
