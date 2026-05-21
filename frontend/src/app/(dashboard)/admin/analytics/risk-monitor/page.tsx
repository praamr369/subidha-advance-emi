"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable from "@/components/ui/DataTable";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import PortalPage from "@/components/ui/PortalPage";
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
    <PortalPage
      title="Risk Monitor"
      subtitle="Overdue EMI risk watchlist for collection escalation."
      headerMode="erp"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Reports", href: "/admin/reports" },
        { label: "Analytics", href: "/admin/reports?live=1" },
        { label: "Risk monitor" },
      ]}
      statusBadge={{ label: "Analytics", tone: "warning" }}
    >
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
    </PortalPage>
  );
}
