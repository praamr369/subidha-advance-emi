"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, RefreshCw, Wallet } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { CustomerIntelligenceTrigger } from "@/components/customer-intelligence/CustomerIntelligenceTrigger";
import DataTable from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import { WorkspaceSection } from "@/components/ui/workspace";
import { downloadCsv } from "@/lib/export/csv";
import type { EmiRecord } from "@/services/emis";
import { getOverdueSummary } from "@/services/reports";

function money(value: string | number): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load overdue report.";
}

export default function OverdueReportPage() {
  const [summary, setSummary] =
    useState<Awaited<ReturnType<typeof getOverdueSummary>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await getOverdueSummary();
        setSummary(payload);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        setSummary(null);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadSummary("initial");
  }, [loadSummary]);

  const rows = useMemo(() => summary?.rows || [], [summary]);
  const urgentRows = useMemo(
    () => rows.filter((row) => (row.overdue_days || 0) >= 30).length,
    [rows]
  );
  const averageExposure = useMemo(() => {
    if (!summary?.overdueCount) return 0;
    return Number(summary.overdueAmount || 0) / Number(summary.overdueCount || 1);
  }, [summary]);

  return (
    <PortalPage
      title="Overdue EMI Report"
      subtitle="Pending and overdue EMI exposure using backend KPIs with row-level drill-down for operator follow-up."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Reports", href: "/admin/reports" },
        { label: "Overdue" },
      ]}
      actions={[
        {
          href: "/admin/reports",
          label: "Back to Reports",
          variant: "secondary",
        },
        {
          href: "/admin/outstandings?operation=advance_emi&state=overdue",
          label: "Open Unified Outstanding Ledger",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Pending EMI Count",
          value: String(summary?.pendingCount || 0),
        },
        {
          label: "Pending Amount",
          value: money(summary?.pendingAmount || 0),
        },
        {
          label: "Overdue EMI Count",
          value: String(summary?.overdueCount || 0),
          tone: (summary?.overdueCount || 0) > 0 ? "warning" : "default",
        },
        {
          label: "Overdue Amount",
          value: money(summary?.overdueAmount || 0),
          tone: (summary?.overdueAmount || 0) > 0 ? "warning" : "default",
        },
      ]}
      statusBadge={{
        label: (summary?.overdueCount || 0) > 0 ? "Follow-up Required" : "Exposure Report",
        tone: (summary?.overdueCount || 0) > 0 ? "warning" : "info",
      }}
    >
      <div className="space-y-6">
        <TableToolbar
          footer={
            <p className="text-sm text-muted-foreground">
              {summary?.accuracy.note ||
                "Overdue counts come from backend KPI aggregates. Amount exposure is computed from the current overdue EMI list response."}
            </p>
          }
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">
                Current report view
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Use this report to prioritize subscription follow-up and jump into the overdue operational workspace when action is needed.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadSummary("refresh")}
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
                    "overdue-emi-current-view.csv",
                    [
                      { key: "id", header: "emi_id" },
                      { key: "subscription", header: "subscription_id" },
                      { key: "customer_name", header: "customer_name" },
                      { key: "month_no", header: "month_no" },
                      { key: "due_date", header: "due_date" },
                      { key: "amount", header: "emi_amount" },
                      {
                        key: "balance_amount",
                        header: "outstanding_amount",
                        format: (row) =>
                          row.balance_amount || row.outstanding_amount || "0",
                      },
                      { key: "status", header: "status" },
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

        {loading ? <LoadingBlock label="Loading overdue report..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load overdue report"
            description={error}
            onRetry={() => void loadSummary("initial")}
          />
        ) : null}

        {!loading && !error && summary ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Urgent Rows"
                value={String(urgentRows)}
                subtext="30+ day overdue EMIs"
                tone={urgentRows > 0 ? "danger" : "default"}
                icon={<AlertTriangle className="h-4 w-4" />}
              />
              <StatCard
                label="Average Exposure"
                value={money(averageExposure)}
                subtext="Average overdue amount per row"
                icon={<Wallet className="h-4 w-4" />}
              />
              <StatCard
                label="Due Today Or Earlier"
                value={String(rows.length)}
                subtext="Rows in current overdue list"
                tone={rows.length > 0 ? "warning" : "default"}
                icon={<Clock3 className="h-4 w-4" />}
              />
              <StatCard
                label="Action Queue"
                value={rows.length > 0 ? "Open" : "Clear"}
                subtext="Operational follow-up workspace"
                tone={rows.length > 0 ? "warning" : "success"}
                href="/admin/outstandings?operation=advance_emi&state=overdue"
              />
            </div>

            <WorkspaceSection
              title="Overdue EMI drill-down"
              description="Rows below combine backend status with derived overdue aging so operators can decide the next action quickly."
            >
              {rows.length === 0 ? (
                <EmptyState
                  title="No overdue EMI records found"
                  description="No active overdue records. Cancelled and reversed records are available in history/reversal center."
                />
              ) : (
                <DataTable<EmiRecord>
                  rows={rows}
                  error={error}
                  emptyText="No overdue EMI records found."
                  columns={[
                    {
                      key: "id",
                      title: "EMI",
                      render: (row) => (
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">#{row.id}</div>
                          <div className="text-xs text-muted-foreground">
                            Month {row.month_no || "—"}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "customer_name",
                      title: "Customer / Contract",
                      render: (row) => (
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">
                            <CustomerIntelligenceTrigger
                              customerId={row.customer}
                              customerName={row.customer_name || "Unknown customer"}
                              scope="admin"
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.subscription ? `SUB-${row.subscription}` : "No subscription"}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "due_date",
                      title: "Due",
                      sortable: true,
                      sortAccessor: (row) => Date.parse(row.due_date || "") || 0,
                      render: (row) => (
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-foreground">
                            {formatDate(row.due_date)}
                          </div>
                          {(row.overdue_days || 0) > 0 ? (
                            <StatusBadge
                              status="OVERDUE"
                              label={`${row.overdue_days} day${row.overdue_days === 1 ? "" : "s"} overdue`}
                            />
                          ) : null}
                        </div>
                      ),
                    },
                    {
                      key: "amount",
                      title: "EMI",
                      align: "right",
                      render: (row) => money(row.amount),
                    },
                    {
                      key: "balance_amount",
                      title: "Outstanding",
                      align: "right",
                      render: (row) =>
                        money(row.balance_amount || row.outstanding_amount || 0),
                    },
                    {
                      key: "status",
                      title: "Status",
                      render: (row) => (
                        <StatusBadge
                          status={row.status || "PENDING"}
                          isOverdue={Boolean(row.is_overdue)}
                        />
                      ),
                    },
                  ]}
                  rowActions={(row) => (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/subscriptions/${row.subscription}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Subscription
                      </Link>
                      <Link
                        href={`/admin/payments?subscription=${row.subscription}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Payments
                      </Link>
                    </div>
                  )}
                />
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
