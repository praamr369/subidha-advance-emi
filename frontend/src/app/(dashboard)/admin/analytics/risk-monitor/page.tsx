"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DataTable from "@/components/ui/DataTable";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { listEmis, type EmiRecord } from "@/services/emis";

export default function RiskMonitorPage() {
  const [rows, setRows] = useState<EmiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEmis({ overdue_only: true, page: 1 })
      .then((payload) => {
        setRows(payload.results || []);
        setLoading(false);
        setError(null);
      })
      .catch((err: unknown) => {
        setLoading(false);
        setError(err instanceof Error ? err.message : "Failed to load risk monitor");
      });
  }, []);

  const riskRows = useMemo(
    () => rows.map((row) => ({
      id: row.id,
      subscription: row.subscription,
      customer_name: row.customer_name || "-",
      due_date: row.due_date,
      outstanding: Number(row.balance_amount || row.outstanding_amount || 0),
      status: row.status,
    })),
    [rows],
  );

  return (
    <ERPPageShell
      title="Risk Monitor"
      subtitle="Read-only overdue EMI risk watchlist for collection escalation. Source-linked report — drill down to Finance Operations / Outstandings to take action."
      headerMode="erp"
      helperNote="Read-only BI. Decision support only — no posting from this page. To act on overdue EMIs, use Finance Operations / Outstandings or Collections & Cashier."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Reports", href: ROUTES.admin.reports },
        { label: "Analytics", href: `${ROUTES.admin.reports}?live=1` },
        { label: "Risk monitor" },
      ]}
      actions={[
        { href: ROUTES.admin.financeOutstandings, label: "Open Outstandings", variant: "secondary" },
        { href: ROUTES.admin.reportsOverdue, label: "Overdue Report", variant: "secondary" },
      ]}
      statusBadge={{ label: "Read-only BI", tone: "warning" }}
    >
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
        <strong>Drill down to source workflow:</strong> Use the links below to act on overdue risk. No payment or posting can be created from this page.
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={ROUTES.admin.financeOutstandings} className="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 transition hover:bg-amber-100">Finance Operations — Outstandings</Link>
          <Link href={ROUTES.admin.collections} className="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 transition hover:bg-amber-100">Collections & Cashier</Link>
          <Link href={ROUTES.admin.profilesCustomers} className="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 transition hover:bg-amber-100">Profiles — Customers</Link>
        </div>
      </div>

      {loading ? (
        <ERPLoadingState label="Loading risk signals..." />
      ) : error ? (
        <ERPErrorState title="Unable to load risk monitor" description={error} />
      ) : riskRows.length === 0 ? (
        <ERPEmptyState title="No overdue EMI risks" description="No overdue EMI rows returned by this view." />
      ) : (
        <DataTable<(typeof riskRows)[number]>
          rows={riskRows}
          error={error}
          emptyText="No overdue EMI risk events found."
          columns={[
            { key: "id", title: "EMI ID" },
            { key: "subscription", title: "Subscription" },
            { key: "customer_name", title: "Customer" },
            { key: "due_date", title: "Due Date" },
            {
              key: "outstanding",
              title: "Outstanding",
              align: "right",
              render: (row) => `₹${row.outstanding.toFixed(2)}`,
            },
            { key: "status", title: "Status" },
          ]}
        />
      )}
    </ERPPageShell>
  );
}
