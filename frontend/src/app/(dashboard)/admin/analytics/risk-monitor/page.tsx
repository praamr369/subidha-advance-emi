"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import { listEmis, type EmiRecord } from "@/services/emis";

export default function RiskMonitorPage() {
  const [rows, setRows] = useState<EmiRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEmis({ overdue_only: true, page: 1 })
      .then((payload) => {
        setRows(payload.results || []);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load risk monitor"));
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
    <PortalPage title="Risk Monitor" subtitle="Overdue EMI risk watchlist for collection escalation.">
      <DataTable<(typeof riskRows)[number]>
        rows={riskRows}
        error={error}
        emptyText="No overdue EMI risk events found."
        columns={[
          { key: "id", title: "EMI ID" },
          { key: "subscription", title: "Subscription" },
          { key: "customer_name", title: "Customer" },
          { key: "due_date", title: "Due Date" },
          { key: "outstanding", title: "Outstanding", align: "right", render: (row) => `₹${row.outstanding.toFixed(2)}` },
          { key: "status", title: "Status" },
        ]}
      />
    </PortalPage>
  );
}
