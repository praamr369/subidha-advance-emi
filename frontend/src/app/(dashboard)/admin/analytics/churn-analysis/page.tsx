"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import { listSubscriptions, type SubscriptionRecord } from "@/services/subscriptions";

export default function ChurnAnalysisPage() {
  const [rows, setRows] = useState<SubscriptionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSubscriptions({ page: 1 })
      .then((payload) => {
        setRows(payload.results || []);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load churn analysis"));
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
    <PortalPage title="Churn Analysis" subtitle="Operational watchlist based on defaulted or high-outstanding subscriptions.">
      <DataTable<(typeof riskRows)[number]>
        rows={riskRows}
        error={error}
        emptyText="No churn-risk contracts detected in current sample."
        columns={[
          { key: "subscription_number", title: "Subscription" },
          { key: "customer_name", title: "Customer" },
          { key: "status", title: "Status" },
          { key: "outstanding", title: "Outstanding", align: "right", render: (row) => `₹${row.outstanding.toFixed(2)}` },
        ]}
      />
    </PortalPage>
  );
}
