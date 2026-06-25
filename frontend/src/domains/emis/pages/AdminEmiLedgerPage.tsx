"use client";

import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import TableToolbar from "@/components/ui/TableToolbar";
import ERPPageShell from "@/components/erp/ERPPageShell";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/status-badge";
import { DataTableShell, DetailPanel, FormSection, MobileSafeTable } from "@/components/ui/operations";
import { listEmis, type EmiRecord } from "@/services/emis";
import { downloadCsv } from "@/lib/export/csv";

function money(value: string | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export default function AdminEmiLedgerPage() {
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [rows, setRows] = useState<EmiRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");

  const requestKey = `${status}|${overdueOnly}`;

  useEffect(() => {
    let cancelled = false;

    listEmis({ status: status || undefined, overdue_only: overdueOnly })
      .then((payload) => {
        if (cancelled) return;
        setRows(payload.results || []);
        setError(null);
        setLoadedKey(requestKey);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load advance EMI ledger");
        setLoadedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [overdueOnly, requestKey, status]);

  const loading = loadedKey !== requestKey;
  const overdueCount = useMemo(
    () => rows.filter((row) => row.status === "OVERDUE" || Number(row.overdue_days ?? 0) > 0).length,
    [rows]
  );

  return (
    <ERPPageShell
      title="Advance EMI Ledger"
      subtitle="Operational due/paid/waived register for collection routing and reconciliation checks."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "EMI Ledger" },
      ]}
      actions={[
        { href: "/admin/emis/overdue", label: "Overdue Workspace", variant: "secondary" },
        { href: "/admin/payments", label: "Payment Register", variant: "ghost" },
      ]}
      statusBadge={{ label: "EMI Operations", tone: "info" }}
      stats={[
        { label: "Visible Rows", value: String(rows.length) },
        { label: "Overdue Rows", value: String(overdueCount), tone: overdueCount > 0 ? "warning" : undefined },
        { label: "Filter", value: status || "ALL" },
      ]}
    >
      <div className="space-y-6">
        <TableToolbar
          title="Ledger filters"
          description="Filter by EMI state and overdue queue to keep collection and waiver review aligned."
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="space-y-2 text-sm text-foreground">
                <span className="font-medium">Status</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="h-11 rounded-xl border border-border bg-background px-3"
                >
                  <option value="">All status</option>
                  <option value="PENDING">PENDING</option>
                  <option value="PAID">PAID</option>
                  <option value="WAIVED">WAIVED</option>
                  <option value="OVERDUE">OVERDUE</option>
                </select>
              </label>
              <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(event) => setOverdueOnly(event.target.checked)}
                />
                Overdue only
              </label>
            </div>
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  "emi-ledger.csv",
                  [
                    { key: "month_no", header: "month_no" },
                    { key: "subscription", header: "subscription" },
                    { key: "due_date", header: "due_date" },
                    { key: "amount", header: "amount" },
                    { key: "total_paid", header: "paid", format: (row) => row.total_paid || row.paid_amount || "" },
                    { key: "waived_amount", header: "waived_amount" },
                    {
                      key: "balance_amount",
                      header: "outstanding",
                      format: (row) => row.balance_amount || row.outstanding_amount || "",
                    },
                    { key: "status", header: "status" },
                    { key: "lucky_number", header: "lucky_number" },
                  ],
                  rows
                )
              }
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export Current View
            </button>
          </div>
        </TableToolbar>

        {loading ? <LoadingBlock label="Loading advance EMI ledger..." /> : null}
        {!loading && error ? (
          <ErrorState
            title="Unable to load advance EMI ledger"
            description={error}
          />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No EMI rows found"
            description="No rows match the active filter set. Pending and overdue rows will appear when collectible entries exist."
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <FormSection
            title="EMI register"
            description="Review due dates, payment coverage, waivers, and outstanding exposure per row."
          >
            <DetailPanel
              title="Status guidance"
              description="Pending and overdue are the active collection queue (subject to role and backend rules). Paid, waived, void, cancelled, and reversed lines are settled or non-collectible — they stay visible for audit only."
            >
              <div className="flex flex-wrap gap-2">
                <StatusBadge status="PENDING" />
                <StatusBadge status="OVERDUE" />
                <StatusBadge status="PAID" />
                <StatusBadge status="WAIVED" />
                <StatusBadge status="VOID" />
                <StatusBadge status="CANCELLED" />
                <StatusBadge status="REVERSED" />
              </div>
            </DetailPanel>

            <DataTableShell className="mt-4">
              <MobileSafeTable className="border-none bg-transparent">
                <DataTable<EmiRecord>
                  rows={rows}
                  loading={loading}
                  error={error}
                  emptyText="No advance EMI records found for this filter."
                  columns={[
                    { key: "month_no", title: "Advance EMI #" },
                    { key: "subscription", title: "Subscription" },
                    { key: "due_date", title: "Due Date" },
                    { key: "amount", title: "Amount", align: "right", render: (row) => money(row.amount) },
                    {
                      key: "total_paid",
                      title: "Paid",
                      align: "right",
                      render: (row) => money(row.total_paid || row.paid_amount),
                    },
                    {
                      key: "waived_amount",
                      title: "Waived",
                      align: "right",
                      render: (row) => money(row.waived_amount),
                    },
                    {
                      key: "balance_amount",
                      title: "Outstanding",
                      align: "right",
                      render: (row) => money(row.balance_amount || row.outstanding_amount),
                    },
                    {
                      key: "status",
                      title: "Status",
                      render: (row) => <StatusBadge status={row.status} />,
                    },
                    {
                      key: "lucky_number",
                      title: "Lucky ID",
                      render: (row) => (row.lucky_number ? `#${row.lucky_number}` : "-"),
                    },
                  ]}
                />
              </MobileSafeTable>
            </DataTableShell>
          </FormSection>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
