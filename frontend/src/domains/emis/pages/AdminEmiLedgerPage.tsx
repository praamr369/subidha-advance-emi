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

const PAGE_SIZE = 50;

export default function AdminEmiLedgerPage() {
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<EmiRecord[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [exporting, setExporting] = useState(false);

  const requestKey = `${status}|${overdueOnly}|${page}`;

  // Reset to first page whenever a filter changes.
  function applyStatus(next: string) {
    setStatus(next);
    setPage(1);
  }
  function applyOverdueOnly(next: boolean) {
    setOverdueOnly(next);
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;

    listEmis({ status: status || undefined, overdue_only: overdueOnly, page, page_size: PAGE_SIZE })
      .then((payload) => {
        if (cancelled) return;
        setRows(payload.results || []);
        setCount(payload.count ?? payload.results?.length ?? 0);
        setError(null);
        setLoadedKey(requestKey);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setCount(0);
        setError(err instanceof Error ? err.message : "Failed to load advance EMI ledger");
        setLoadedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [overdueOnly, page, requestKey, status]);

  const loading = loadedKey !== requestKey;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const overdueCount = useMemo(
    () => rows.filter((row) => row.status === "OVERDUE" || Number(row.overdue_days ?? 0) > 0).length,
    [rows]
  );

  // Export the full filtered set on demand (no page param -> backend returns all
  // matching rows), so CSV export stays complete even though the table is paged.
  async function handleExport() {
    setExporting(true);
    try {
      const payload = await listEmis({ status: status || undefined, overdue_only: overdueOnly });
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
        payload.results || []
      );
    } finally {
      setExporting(false);
    }
  }

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
        { label: "Total Rows", value: loading ? "—" : String(count) },
        { label: "Page", value: `${page} / ${totalPages}` },
        { label: "Overdue (page)", value: String(overdueCount), tone: overdueCount > 0 ? "warning" : undefined },
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
                  onChange={(event) => applyStatus(event.target.value)}
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
                  onChange={(event) => applyOverdueOnly(event.target.checked)}
                />
                Overdue only
              </label>
            </div>
            <button
              type="button"
              disabled={count === 0 || exporting}
              onClick={() => void handleExport()}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? "Exporting…" : "Export All (filtered)"}
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

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)} of {count}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="h-9 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  className="h-9 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </FormSection>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
