"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import type { StockSummaryRow } from "@/services/inventory";
import { getStockSummary } from "@/services/inventory";

const columns: EnterpriseColumnDef<StockSummaryRow>[] = [
  { key: "product_code", header: "Product Code" },
  { key: "product_name", header: "Product" },
  { key: "sku", header: "SKU" },
  { key: "default_stock_location_name", header: "Default Location", render: (row) => row.default_stock_location_name || "Unassigned" },
  { key: "on_hand_qty", header: "On Hand" },
  { key: "reorder_level_qty", header: "Reorder Level" },
  { key: "unit_of_measure", header: "Unit" },
  {
    key: "is_below_reorder",
    header: "Status",
    render: (row) => (row.is_below_reorder ? "Reorder needed" : "Healthy"),
  },
];

export default function InventoryStockOnHandPage() {
  const [rows, setRows] = useState<StockSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPage() {
      try {
        const payload = await getStockSummary();
        if (cancelled) return;
        setRows(payload.results);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setRows([]);
        setError(accountingErrorMessage(err, "Failed to load stock on hand."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPage();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PortalPage
      eyebrow="Inventory Review"
      title="Stock On Hand"
      subtitle="Live stock availability by product master, SKU, and default location."
      helperNote="Stock on hand is a live inventory snapshot from the stock ledger. It does not derive from billing totals or EMI schedules."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Stock On Hand" },
      ]}
    >
      <WorkspaceDirectory
        title="Inventory route map"
        description="Move between stock review, movement registers, master control, valuation, and opening-stock actions from one inventory workspace."
        groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
      />

      <EnterpriseDataTable
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        emptyTitle="No stock on hand rows found"
        emptyDescription="Create inventory profiles or import opening stock to populate the on-hand register."
      />
    </PortalPage>
  );
}
