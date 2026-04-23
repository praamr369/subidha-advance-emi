"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  accountingDate,
  accountingErrorMessage,
  accountingMoney,
  AccountingPeriodFilters,
} from "@/components/accounting/shared";
import type { InventoryValuationReport, InventoryValuationRow } from "@/services/inventory";
import { getInventoryValuation } from "@/services/inventory";

const columns: EnterpriseColumnDef<InventoryValuationRow>[] = [
  { key: "product_code", header: "Product" },
  { key: "product_name", header: "Item" },
  { key: "sku", header: "SKU" },
  { key: "valuation_method", header: "Method" },
  { key: "on_hand_qty", header: "On Hand" },
  { key: "unit_cost", header: "Unit Cost", render: (row) => accountingMoney(row.unit_cost) },
  { key: "stock_value", header: "Stock Value", render: (row) => accountingMoney(row.stock_value) },
];

const today = new Date().toISOString().slice(0, 10);

export default function InventoryValuationPage() {
  const [report, setReport] = useState<InventoryValuationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asOfDate, setAsOfDate] = useState(today);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      try {
        const payload = await getInventoryValuation({ as_of_date: asOfDate || undefined });
        if (cancelled) return;
        setReport(payload);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setReport(null);
        setError(accountingErrorMessage(err, "Failed to load inventory valuation."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [asOfDate]);

  return (
    <PortalPage
      eyebrow="Inventory Valuation Review"
      title="Inventory Valuation"
      subtitle="Current stock value is derived from tracked inventory items and purchase cost foundations without touching product selling-price or EMI contract semantics."
      helperNote="Inventory valuation is a ledger-backed stock review surface. It is not a billing revenue view or an accounting balance substitute."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Valuation" },
      ]}
      stats={[
        { label: "As Of", value: accountingDate(report?.as_of_date || asOfDate), tone: "info" },
        { label: "Rows", value: String(report?.count ?? 0) },
        { label: "Total Value", value: accountingMoney(report?.total_value) },
      ]}
      statusBadge={{ label: "Foundation Only", tone: "warning" }}
    >
      <WorkspaceDirectory
        title="Inventory route map"
        description="Move between valuation, live stock, ledger review, movements, and opening-stock control from one inventory workspace."
        groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
      />

      <WorkspaceSection
        title="Valuation Date"
        description="Use an as-of date to review the stock valuation snapshot from live ledger-backed stock."
      >
        <AccountingPeriodFilters asOf={asOfDate} onAsOfChange={setAsOfDate} />
      </WorkspaceSection>

      <EnterpriseDataTable
        data={report?.rows ?? []}
        columns={columns}
        loading={loading}
        error={error}
        emptyTitle="No valuation rows found"
        emptyDescription="Create inventory items and post stock movements to produce valuation rows."
      />
    </PortalPage>
  );
}
