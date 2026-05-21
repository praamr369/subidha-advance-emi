"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable from "@/components/ui/DataTable";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import PortalPage from "@/components/ui/PortalPage";
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
    <PortalPage
      title="Churn Analysis"
      subtitle="Operational watchlist based on defaulted or high-outstanding subscriptions."
      headerMode="erp"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Reports", href: "/admin/reports" },
        { label: "Analytics", href: "/admin/reports?live=1" },
        { label: "Churn analysis" },
      ]}
      statusBadge={{ label: "Analytics", tone: "info" }}
    >
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
    </PortalPage>
  );
}
