"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  CreditCard,
  RefreshCw,
  Smartphone,
  Wallet,
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import { WorkspaceSection } from "@/components/ui/workspace";
import { downloadCsv } from "@/lib/export/csv";
import { getRevenueSummary } from "@/services/reports";
import type { PaymentRegisterRow } from "@/services/payments";

function money(value: string | number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
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
  return "Failed to load revenue summary.";
}

export default function RevenueReportPage() {
  const [summary, setSummary] =
    useState<Awaited<ReturnType<typeof getRevenueSummary>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await getRevenueSummary();
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

  const rows = summary?.rows || [];
  const methodBreakdown = summary?.methodBreakdown || {
    CASH: 0,
    UPI: 0,
    BANK: 0,
    CARD: 0,
    OTHER: 0,
  };

  return (
    <PortalPage
      title="Revenue Report"
      subtitle="Operational revenue view sourced from the admin payment register so collection totals and reversal visibility stay aligned."
      headerMode="erp"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Reports", href: "/admin/reports" },
        { label: "Revenue" },
      ]}
      actions={[
        {
          href: "/admin/reports",
          label: "Back to Reports",
          variant: "secondary",
        },
        {
          href: "/admin/payments",
          label: "Open Payments Register",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Net Collected",
          value: money(summary?.totalAmount || 0),
          tone: "success",
        },
        {
          label: "Active Payments",
          value: String(summary?.totalPayments || 0),
        },
        {
          label: "Gross Amount",
          value: money(summary?.gross_amount || 0),
        },
        {
          label: "Reversed Amount",
          value: money(summary?.reversed_amount || 0),
          tone: Number(summary?.reversed_amount || 0) > 0 ? "warning" : "default",
        },
      ]}
      statusBadge={{ label: "Finance Report", tone: "info" }}
    >
      <div className="space-y-6">
        <TableToolbar
          footer={
            <p className="text-sm text-muted-foreground">
              {summary?.accuracy.note ||
                "Revenue summary follows the admin payment register summary so daily totals and reversal treatment stay consistent."}
            </p>
          }
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">
                Current report view
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Export and drill into payment rows from the same register-backed revenue dataset.
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
                    "revenue-report-current-view.csv",
                    [
                      { key: "id", header: "payment_id" },
                      { key: "payment_date", header: "payment_date" },
                      { key: "subscription", header: "subscription_id" },
                      { key: "amount", header: "amount" },
                      { key: "method", header: "method" },
                      {
                        key: "reference_no",
                        header: "reference_no",
                        format: (row) => row.reference_no || "",
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

        {loading ? <LoadingBlock label="Loading revenue summary..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load revenue report"
            description={error}
            onRetry={() => void loadSummary("initial")}
          />
        ) : null}

        {!loading && !error && summary ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Cash"
                value={money(methodBreakdown.CASH)}
                subtext="Cash collections"
                icon={<Wallet className="h-4 w-4" />}
              />
              <StatCard
                label="UPI"
                value={money(methodBreakdown.UPI)}
                subtext="Digital collections"
                tone="success"
                icon={<Smartphone className="h-4 w-4" />}
              />
              <StatCard
                label="Bank"
                value={money(methodBreakdown.BANK)}
                subtext="Bank transfer collections"
                tone="info"
                icon={<Banknote className="h-4 w-4" />}
              />
              <StatCard
                label="Card / Other"
                value={money(methodBreakdown.CARD + methodBreakdown.OTHER)}
                subtext="Alternate collection methods"
                tone="warning"
                icon={<CreditCard className="h-4 w-4" />}
              />
            </div>

            <WorkspaceSection
              title="Payment drill-down"
              description="Use this table to validate revenue totals against the underlying payment rows."
            >
              {rows.length === 0 ? (
                <EmptyState
                  title="No payment records available"
                  description="There are no payment records in the current revenue view."
                />
              ) : (
                <DataTable<PaymentRegisterRow>
                  rows={rows}
                  error={error}
                  emptyText="No payment records available."
                  columns={[
                    {
                      key: "id",
                      title: "Payment",
                      render: (row) => (
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">#{row.id}</div>
                          <div className="text-xs text-muted-foreground">
                            Ref {row.reference_no || `AUTO-${row.id}`}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "subscription",
                      title: "Customer / Contract",
                      render: (row) => (
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">
                            {row.customer_name || "Unknown customer"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.subscription_number ||
                              (row.subscription ? `SUB-${row.subscription}` : "No subscription")}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "payment_date",
                      title: "Recorded",
                      sortable: true,
                      sortAccessor: (row) => Date.parse(row.payment_date || "") || 0,
                      render: (row) => formatDate(row.payment_date),
                    },
                    {
                      key: "method",
                      title: "Method",
                      render: (row) => row.method || "—",
                    },
                    {
                      key: "amount",
                      title: "Amount",
                      align: "right",
                      sortable: true,
                      sortAccessor: (row) => Number(row.amount || 0),
                      render: (row) => money(row.amount),
                    },
                    {
                      key: "is_reversed",
                      title: "State",
                      render: (row) => (
                        <StatusBadge
                          status={row.is_reversed ? "REVERSED" : "RECORDED"}
                        />
                      ),
                    },
                  ]}
                  rowActions={(row) => (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/payments/${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Payment
                      </Link>
                      {row.subscription ? (
                        <Link
                          href={`/admin/subscriptions/${row.subscription}`}
                          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                        >
                          Subscription
                        </Link>
                      ) : null}
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
