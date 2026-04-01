"use client";

import { useEffect, useState } from "react";
import DataTable from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import { listPartnerCommissions, type PartnerCommission } from "@/services/partner";

function money(value?: string | number | null): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

export default function PartnerCommissionsPage() {
  const [rows, setRows] = useState<PartnerCommission[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPartnerCommissions()
      .then((payload) => {
        setRows(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load commissions");
      });
  }, []);

  return (
    <PortalPage
      title="Commission Ledger"
      subtitle="Partner commission visibility (earned, pending, and paid)."
    >
      <DataTable<PartnerCommission>
        rows={rows}
        error={error}
        emptyText="No commission records found."
        columns={[
          { key: "id", title: "Commission ID" },
          { key: "subscription", title: "Subscription" },
          {
            key: "commission_amount",
            title: "Amount",
            align: "right",
            render: (row) => money((row as PartnerCommission & { commission_amount?: string | number }).commission_amount),
          },
          { key: "status", title: "Status" },
          {
            key: "created_at",
            title: "Created",
            render: (row) => (row.created_at ? new Date(row.created_at).toLocaleString() : "-"),
          },
        ]}
      />
    </PortalPage>
  );
}