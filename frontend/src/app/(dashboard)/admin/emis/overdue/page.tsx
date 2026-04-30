"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable, { type Column } from "@/components/ui/DataTable";
import {
  DataTableShell,
  DetailPanel,
  FormSection,
  KpiCard,
  QuickActionGrid,
} from "@/components/ui/operations";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { downloadCsv } from "@/lib/export/csv";
import { getOverdueSummary } from "@/services/reports";
import type { EmiRecord } from "@/services/emis";

type OverdueSummary = Awaited<ReturnType<typeof getOverdueSummary>>;

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function overdueDays(dueDate: string | null | undefined): number {
  if (!dueDate) return 0;
  const parsed = Date.parse(dueDate);
  if (Number.isNaN(parsed)) return 0;

  const diffMs = Date.now() - parsed;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load overdue EMI records.";
}

export default function OverdueEmiPage() {
  const [summary, setSummary] = useState<OverdueSummary | null>(null);
  const [rows, setRows] = useState<EmiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [agingFilter, setAgingFilter] = useState<"ALL" | "1_7" | "8_30" | "31_PLUS">(
    "ALL"
  );

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const payload = await getOverdueSummary();
      setSummary(payload);
      setRows(payload.rows ?? []);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setSummary(null);
        setRows([]);
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

  const totalExposure = useMemo(
    () =>
      rows.reduce(
        (sum, row) =>
          sum +
          Number(row.balance_amount ?? row.outstanding_amount ?? row.amount ?? 0),
        0
      ),
    [rows]
  );

  const oldestOverdueDays = useMemo(
    () =>
      rows.reduce((max, row) => Math.max(max, overdueDays(row.due_date)), 0),
    [rows]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const age = row.overdue_days ?? overdueDays(row.due_date);
      const query = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !query ||
        (row.customer_name || "").toLowerCase().includes(query) ||
        (row.customer_phone || "").includes(query) ||
        String(row.subscription).includes(query) ||
        (row.batch_code || "").toLowerCase().includes(query);

      const matchesAge =
        agingFilter === "ALL" ||
        (agingFilter === "1_7" && age >= 1 && age <= 7) ||
        (agingFilter === "8_30" && age >= 8 && age <= 30) ||
        (agingFilter === "31_PLUS" && age >= 31);

      return matchesQuery && matchesAge;
    });
  }, [agingFilter, rows, searchQuery]);

  const agingCounts = useMemo(
    () => ({
      oneToSeven: rows.filter((row) => {
        const age = row.overdue_days ?? overdueDays(row.due_date);
        return age >= 1 && age <= 7;
      }).length,
      eightToThirty: rows.filter((row) => {
        const age = row.overdue_days ?? overdueDays(row.due_date);
        return age >= 8 && age <= 30;
      }).length,
      thirtyOnePlus: rows.filter((row) => {
        const age = row.overdue_days ?? overdueDays(row.due_date);
        return age >= 31;
      }).length,
    }),
    [rows]
  );

  const exportRows = useMemo(
    () =>
      filteredRows.map((row) => ({
        id: row.id,
        customer_name: row.customer_name ?? "",
        customer_phone: row.customer_phone ?? "",
        subscription: row.subscription,
        batch_code: row.batch_code ?? "",
        lucky_number:
          typeof row.lucky_number === "number" ? String(row.lucky_number) : "",
        month_no: row.month_no,
        due_date: row.due_date,
        overdue_days: row.overdue_days ?? overdueDays(row.due_date),
        amount: row.amount,
        total_paid: row.total_paid ?? "",
        balance_amount: row.balance_amount ?? row.outstanding_amount ?? "",
        status: row.status,
      })),
    [filteredRows]
  );

  const columns = useMemo<Column<EmiRecord>[]>(
    () => [
      {
        key: "customer_name",
        title: "Customer",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              {row.customer_name || "Unknown customer"}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.customer_phone || "No phone on record"}
            </div>
            <div className="text-xs text-muted-foreground">
              Batch {row.batch_code || "—"}
              {typeof row.lucky_number === "number"
                ? ` · Lucky #${row.lucky_number}`
                : ""}
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
              SUB-{row.subscription}
            </div>
            <div className="text-xs text-muted-foreground">
              EMI Month {row.month_no}
            </div>
          </div>
        ),
      },
      {
        key: "due_date",
        title: "Due",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              {formatDate(row.due_date)}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.overdue_days ?? overdueDays(row.due_date)} days overdue
            </div>
          </div>
        ),
        sortable: true,
        sortAccessor: (row) => Date.parse(row.due_date || "") || 0,
      },
      {
        key: "financial",
        title: "Financial",
        render: (row) => (
          <div className="space-y-1 text-sm">
            <div>EMI: {money(row.amount)}</div>
            <div>Paid: {money(row.total_paid)}</div>
            <div>
              Balance: {money(row.balance_amount ?? row.outstanding_amount)}
            </div>
          </div>
        ),
      },
      {
        key: "status",
        title: "State",
        render: (row) => (
          <div className="space-y-1">
            <StatusBadge
              status={row.status}
              isOverdue={Boolean(row.is_overdue ?? overdueDays(row.due_date) > 0)}
            />
            <div className="text-xs text-muted-foreground">
              {row.subscription_status || "Follow-up required"}
            </div>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <PortalPage
      title="Overdue EMIs"
      subtitle="Operational follow-up workspace for overdue pending installments. Use this page to review exposure, open linked subscriptions, and route to collection workflow."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "EMI Ledger", href: "/admin/emis" },
        { label: "Overdue" },
      ]}
      actions={[
        {
          href: "/admin/collections",
          label: "Open Collections",
          variant: "primary",
        },
        {
          href: "/admin/payments",
          label: "Open Payments",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Overdue EMI Count",
          value: String(summary?.overdueCount ?? summary?.overdue_count ?? 0),
          tone: "warning",
        },
        {
          label: "Overdue Exposure",
          value: money(totalExposure),
          tone: "danger",
        },
        {
          label: "Oldest Overdue",
          value: `${oldestOverdueDays} days`,
          tone: oldestOverdueDays > 30 ? "danger" : "warning",
        },
        {
          label: "Pending EMI Count",
          value: String(summary?.pendingCount ?? summary?.pending_count ?? 0),
        },
      ]}
      statusBadge={{
        label: "Collections Follow-up",
        tone: "warning",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading overdue EMI records..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load overdue EMI records"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <DetailPanel
              title="Collections note"
              description="Use this queue to review overdue exposure, then hand off to collection, subscription review, or payment audit."
            >
              <p className="mt-1 text-sm text-muted-foreground">
                This page focuses on overdue pending EMI rows only. Use it as the
                admin follow-up queue, then open the subscription or the collection
                workspace for the next operational action.
              </p>
            </DetailPanel>

            {rows.length === 0 ? (
              <EmptyState
                title="No overdue EMI records"
                description="No overdue pending EMI rows are currently available for follow-up."
              />
            ) : (
              <>
                <QuickActionGrid>
                  <KpiCard
                    label="Overdue EMI Count"
                    value={String(summary?.overdueCount ?? summary?.overdue_count ?? 0)}
                    helper="Pending overdue installments"
                  />
                  <KpiCard label="Overdue Exposure" value={money(totalExposure)} helper="Current outstanding exposure" />
                  <KpiCard
                    label="Oldest Overdue"
                    value={`${oldestOverdueDays} days`}
                    helper={oldestOverdueDays > 30 ? "Critical aging follow-up" : "Aging in control band"}
                  />
                  <KpiCard
                    label="Pending EMI Count"
                    value={String(summary?.pendingCount ?? summary?.pending_count ?? 0)}
                    helper="Total pending EMI rows"
                  />
                </QuickActionGrid>
                <FormSection
                  title="Overdue EMI Queue"
                  description="Search by customer, phone, subscription, or batch and route each overdue row to the next safe action."
                >
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    disabled={exportRows.length === 0}
                    onClick={() =>
                      downloadCsv(
                        "overdue-emis-current-view.csv",
                        [
                          { key: "id", header: "id" },
                          { key: "customer_name", header: "customer_name" },
                          { key: "customer_phone", header: "customer_phone" },
                          { key: "subscription", header: "subscription" },
                          { key: "batch_code", header: "batch_code" },
                          { key: "lucky_number", header: "lucky_number" },
                          { key: "month_no", header: "month_no" },
                          { key: "due_date", header: "due_date" },
                          { key: "overdue_days", header: "overdue_days" },
                          { key: "amount", header: "amount" },
                          { key: "total_paid", header: "total_paid" },
                          { key: "balance_amount", header: "balance_amount" },
                          { key: "status", header: "status" },
                        ],
                        exportRows
                      )
                    }
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Export Current View
                  </button>
                </div>
                <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search customer, phone, subscription, batch"
                      className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring"
                    />
                  </label>

                  <label className="relative block">
                    <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <select
                      value={agingFilter}
                      onChange={(event) =>
                        setAgingFilter(
                          event.target.value as "ALL" | "1_7" | "8_30" | "31_PLUS"
                        )
                      }
                      className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring"
                    >
                      <option value="ALL">All aging</option>
                      <option value="1_7">1-7 days</option>
                      <option value="8_30">8-30 days</option>
                      <option value="31_PLUS">31+ days</option>
                    </select>
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-border bg-background px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        1-7 Days
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {agingCounts.oneToSeven}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        8-30 Days
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {agingCounts.eightToThirty}
                      </div>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                        31+ Days
                      </div>
                      <div className="mt-1 text-sm font-semibold text-red-800">
                        {agingCounts.thirtyOnePlus}
                      </div>
                    </div>
                  </div>
                </div>

                <DataTableShell>
                <DataTable<EmiRecord>
                  rows={filteredRows}
                  columns={columns}
                  emptyText="No overdue EMI rows."
                  pageSize={12}
                  rowActions={(row) => (
                    <div className="flex flex-col items-end gap-2">
                      <Link
                        href={`/admin/finance/collect?subscription=${row.subscription}`}
                        className="inline-flex items-center rounded-md border border-foreground bg-foreground px-3 py-1.5 text-sm font-medium text-background shadow-sm transition hover:opacity-90"
                      >
                        Collect Payment
                      </Link>

                      <Link
                        href={`/admin/subscriptions/${row.subscription}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Subscription
                      </Link>

                      <Link
                        href={`/admin/collections?subscription=${row.subscription}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Collections
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
                </DataTableShell>
              </FormSection>
              </>
            )}
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
