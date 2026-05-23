"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  ERPDataToolbar,
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPSectionShell,
  ERPStatusBadge,
} from "@/components/erp";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { ApiError } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { listAdminCashierDayCloses } from "@/services/settlements";
import type { CashierDayClose } from "@/types/settlements";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.readableMessage || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export default function AdminDayClosesPage() {
  const [rows, setRows] = useState<CashierDayClose[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [businessDateFilter, setBusinessDateFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listAdminCashierDayCloses({
        status: statusFilter || undefined,
        business_date: businessDateFilter || undefined,
      });
      setRows(payload.results ?? []);
      setError(null);
    } catch (err) {
      setError(formatError(err, "Failed to load day-closes."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, businessDateFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load();
  }

  const columns = useMemo<Column<CashierDayClose>[]>(
    () => [
      {
        key: "close_no",
        title: "Record",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{row.close_no}</div>
            <div className="text-xs text-muted-foreground">{row.business_date}</div>
          </div>
        ),
      },
      {
        key: "cashier",
        title: "Cashier",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{row.cashier_username || `User #${row.cashier}`}</div>
            <div className="text-xs text-muted-foreground">{row.branch_name || "—"}</div>
          </div>
        ),
      },
      {
        key: "system_cash_total",
        title: "System",
        align: "right",
        render: (row) => money(row.system_cash_total),
      },
      {
        key: "counted_cash",
        title: "Counted",
        align: "right",
        render: (row) => money(row.counted_cash),
      },
      {
        key: "variance",
        title: "Variance",
        align: "right",
        render: (row) => money(row.variance),
      },
      {
        key: "status",
        title: "Status",
        render: (row) => <ERPStatusBadge status={row.status} hideIcon />,
      },
      {
        key: "actions",
        title: "",
        render: (row) => (
          <Link className="text-sm font-semibold text-primary hover:underline" href={`${ROUTES.admin.settlementsDayCloses}/${row.id}`}>
            Review →
          </Link>
        ),
      },
    ],
    []
  );

  return (
    <ERPPageShell
      title="Day-closes"
      subtitle="Admin review for cashier day-close evidence only."
      helperNote="Approval/rejection reviews evidence only. No accounting entry is created and no payment record is modified."
      helperTone="warning"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settlements", href: ROUTES.admin.settlements },
        { label: "Day-closes" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
      headerMode="erp"
      actions={[
        { href: ROUTES.admin.settlementsBankImports, label: "Bank imports", variant: "secondary" },
        { href: ROUTES.admin.settlementsUpiImports, label: "UPI imports", variant: "secondary" },
      ]}
    >
      <ERPSectionShell title="Register" description="Cashier day-close records pending admin review and archive.">
        <ERPDataToolbar
          left={
            <form onSubmit={handleApplyFilters} className="flex flex-wrap items-end gap-2">
              <label className="block">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Status</div>
                <select
                  className="mt-1 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="SUBMITTED">SUBMITTED</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="VOIDED">VOIDED</option>
                </select>
              </label>
              <label className="block">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Business date</div>
                <input
                  className="mt-1 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm"
                  type="date"
                  value={businessDateFilter}
                  onChange={(e) => setBusinessDateFilter(e.target.value)}
                />
              </label>
              <button
                type="submit"
                className="rounded-xl border border-border bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Apply
              </button>
            </form>
          }
          right={<div className="text-sm text-muted-foreground">{rows.length} records</div>}
        />

        {loading ? <ERPLoadingState label="Loading day-closes…" /> : null}
        {!loading && error ? <ERPErrorState message={error} onRetry={() => void load()} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState title="No day-closes yet" description="Cashier day-close records will appear here for review." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <DataTable columns={columns} rows={rows} />
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
