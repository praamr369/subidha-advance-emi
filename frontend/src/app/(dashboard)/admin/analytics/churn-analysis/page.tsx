"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DataTable from "@/components/ui/DataTable";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { listSubscriptions, type SubscriptionRecord } from "@/services/subscriptions";

export default function ChurnAnalysisPage() {
  const [rows, setRows] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSubscriptions({ page: 1 })
      .then((payload) => {
        setRows(payload.results || []);
        setLoading(false);
        setError(null);
      })
      .catch((err: unknown) => {
        setLoading(false);
        setError(err instanceof Error ? err.message : "Failed to load churn analysis");
      });
  }, []);

  const riskRows = useMemo(
    () => rows
      .map((row) => ({
        id: row.id,
        subscription_number: row.subscription_number || `SUB-${row.id}`,
        customer_name: row.customer_name || `Customer #${row.customer}`,
        status: row.status || "-",
        outstanding: Number(row.financial_summary?.outstanding_amount || 0),
      }))
      .filter((row) => row.status === "DEFAULTED" || row.outstanding > 0),
    [rows],
  );

  return (
    <ERPPageShell
      title="Churn Analysis"
      subtitle="Read-only churn-risk watchlist based on defaulted or high-outstanding subscriptions. Source-linked report — drill down to Profiles / Customers for action."
      headerMode="erp"
      helperNote="Read-only BI. Decision support only — no posting from this page. To act on a defaulted contract, use Sales & Contracts or Finance Operations."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Reports", href: ROUTES.admin.reports },
        { label: "Analytics", href: `${ROUTES.admin.reports}?live=1` },
        { label: "Churn analysis" },
      ]}
      actions={[
        { href: ROUTES.admin.profilesCustomers, label: "Profiles — Customers", variant: "secondary" },
        { href: ROUTES.admin.financeOutstandings, label: "Open Outstandings", variant: "secondary" },
      ]}
      statusBadge={{ label: "Read-only BI", tone: "info" }}
    >
      <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-800">
        <strong>Drill down to source workflow:</strong> No mutation can be made from this page. Use the links below to act on churn-risk contracts.
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={ROUTES.admin.profilesCustomers} className="inline-flex items-center rounded-md border border-sky-300 bg-card px-3 py-1 text-xs font-medium text-sky-900 transition hover:bg-sky-100">Profiles — Customers</Link>
          <Link href={ROUTES.admin.subscriptions} className="inline-flex items-center rounded-md border border-sky-300 bg-card px-3 py-1 text-xs font-medium text-sky-900 transition hover:bg-sky-100">Sales & Contracts</Link>
          <Link href={ROUTES.admin.financeOutstandings} className="inline-flex items-center rounded-md border border-sky-300 bg-card px-3 py-1 text-xs font-medium text-sky-900 transition hover:bg-sky-100">Finance Operations — Outstandings</Link>
        </div>
      </div>

      {loading ? (
        <ERPLoadingState label="Loading watchlist..." />
      ) : error ? (
        <ERPErrorState title="Unable to load churn analysis" description={error} />
      ) : riskRows.length === 0 ? (
        <ERPEmptyState
          title="No churn-risk contracts"
          description="No defaulted or outstanding contracts returned by this view."
        />
      ) : (
        <DataTable<(typeof riskRows)[number]>
          rows={riskRows}
          error={error}
          emptyText="No churn-risk contracts detected in current sample."
          columns={[
            { key: "subscription_number", title: "Subscription" },
            { key: "customer_name", title: "Customer" },
            { key: "status", title: "Status" },
            {
              key: "outstanding",
              title: "Outstanding",
              align: "right",
              render: (row) => `₹${row.outstanding.toFixed(2)}`,
            },
          ]}
        />
      )}
    </ERPPageShell>
  );
}
