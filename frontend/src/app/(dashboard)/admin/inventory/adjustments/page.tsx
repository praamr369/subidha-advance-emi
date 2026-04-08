"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage } from "@/components/accounting/shared";
import type { StockAdjustment } from "@/services/inventory";
import {
  approveStockAdjustment,
  listStockAdjustments,
  postStockAdjustment,
} from "@/services/inventory";

export default function InventoryAdjustmentsPage() {
  const [rows, setRows] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    try {
      const payload = await listStockAdjustments();
      setRows(payload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load stock adjustments."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const columns: EnterpriseColumnDef<StockAdjustment>[] = [
    { key: "adjustment_no", header: "Adjustment" },
    { key: "adjustment_date", header: "Date", render: (row) => accountingDate(row.adjustment_date) },
    { key: "status", header: "Status" },
    { key: "reason", header: "Reason" },
    {
      key: "lines",
      header: "Lines",
      render: (row) => String(row.lines.length),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "DRAFT" ? (
            <ConfirmActionButton
              label="Approve"
              title={`Approve ${row.adjustment_no}?`}
              description="Only approved adjustments can be posted into the stock ledger."
              onConfirm={async () => {
                await approveStockAdjustment(row.id);
                await loadPage();
              }}
              variant="secondary"
            />
          ) : null}
          {row.status === "APPROVED" ? (
            <ConfirmActionButton
              label="Post"
              title={`Post ${row.adjustment_no}?`}
              description="Posting will write stock ledger rows and make the adjustment operationally final."
              onConfirm={async () => {
                await postStockAdjustment(row.id);
                await loadPage();
              }}
              variant="primary"
            />
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <PortalPage
      title="Stock Adjustments"
      subtitle="Approve and post counted stock corrections without rewriting product or billing history."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Adjustments" },
      ]}
    >
      <EnterpriseDataTable
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        emptyTitle="No stock adjustments yet"
        emptyDescription="Create a counted stock adjustment to move stock in or out safely."
      />
    </PortalPage>
  );
}
