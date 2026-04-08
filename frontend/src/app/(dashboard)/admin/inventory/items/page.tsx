"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import type { InventoryItem } from "@/services/inventory";
import { listInventoryItems } from "@/services/inventory";

const columns: EnterpriseColumnDef<InventoryItem>[] = [
  { key: "product_code", header: "Product Code" },
  { key: "product_name", header: "Product" },
  { key: "sku", header: "SKU" },
  { key: "current_stock_qty", header: "On Hand" },
  { key: "reorder_level_qty", header: "Reorder" },
  { key: "valuation_method", header: "Valuation" },
  {
    key: "is_active",
    header: "Status",
    render: (row) => (row.is_active ? "Active" : "Inactive"),
  },
];

export default function InventoryItemsPage() {
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPage() {
      try {
        const payload = await listInventoryItems();
        if (cancelled) return;
        setRows(payload.results);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setRows([]);
        setError(accountingErrorMessage(err, "Failed to load inventory items."));
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
      title="Inventory Items"
      subtitle="Tracked product profiles with stock settings, reorder levels, and valuation foundations."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Items" },
      ]}
    >
      <EnterpriseDataTable
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        emptyTitle="No inventory items are configured"
        emptyDescription="Add inventory profiles for products that should participate in stock control."
      />
    </PortalPage>
  );
}

