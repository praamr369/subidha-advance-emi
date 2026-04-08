"use client";

import { useEffect, useState } from "react";
import { Boxes, ClipboardCheck, PackageSearch, ScrollText } from "lucide-react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage } from "@/components/accounting/shared";
import {
  getStockSummary,
  listInventoryItems,
  listStockAdjustments,
  type StockAdjustment,
  type StockSummaryRow,
} from "@/services/inventory";

const summaryColumns: EnterpriseColumnDef<StockSummaryRow>[] = [
  { key: "product_code", header: "Product" },
  { key: "sku", header: "SKU" },
  { key: "on_hand_qty", header: "On Hand" },
  { key: "reorder_level_qty", header: "Reorder" },
  {
    key: "is_below_reorder",
    header: "Alert",
    render: (row) => (row.is_below_reorder ? "Reorder needed" : "Healthy"),
  },
];

export default function AdminInventoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemsCount, setItemsCount] = useState(0);
  const [stockSummary, setStockSummary] = useState<StockSummaryRow[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadPage() {
      setLoading(true);
      try {
        const [itemsPayload, summaryPayload, adjustmentPayload] = await Promise.all([
          listInventoryItems(),
          getStockSummary(),
          listStockAdjustments(),
        ]);
        if (cancelled) return;
        setItemsCount(itemsPayload.count);
        setStockSummary(summaryPayload.results);
        setAdjustments(adjustmentPayload.results);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(accountingErrorMessage(err, "Failed to load inventory operations."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPage();
    return () => {
      cancelled = true;
    };
  }, []);

  const belowReorder = stockSummary.filter((row) => row.is_below_reorder).length;
  const draftAdjustments = adjustments.filter((row) => row.status === "DRAFT").length;
  const approvedAdjustments = adjustments.filter((row) => row.status === "APPROVED").length;
  const latestAdjustment = adjustments[0];

  return (
    <PortalPage
      title="Inventory Operations"
      subtitle="Additive stock control for retail billing, purchase intake, adjustments, and future EMI delivery outflows."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory" },
      ]}
      statusBadge={{ label: "Admin Controlled", tone: "info" }}
      actions={[
        { href: ROUTES.admin.inventoryItems, label: "Items", variant: "primary" },
        { href: ROUTES.admin.inventoryMovements, label: "Movements", variant: "secondary" },
        { href: ROUTES.admin.inventoryLedger, label: "Ledger", variant: "secondary" },
        { href: ROUTES.admin.inventoryAdjustments, label: "Adjustments", variant: "secondary" },
        { href: ROUTES.admin.inventoryValuation, label: "Valuation", variant: "secondary" },
      ]}
      stats={[
        { label: "Tracked Items", value: String(itemsCount), tone: "info" },
        { label: "Below Reorder", value: String(belowReorder), tone: belowReorder > 0 ? "warning" : "success" },
        { label: "Draft Adjustments", value: String(draftAdjustments), tone: draftAdjustments > 0 ? "warning" : "default" },
        { label: "Approved Adjustments", value: String(approvedAdjustments), tone: approvedAdjustments > 0 ? "warning" : "success" },
      ]}
    >
      {loading ? <LoadingBlock label="Loading inventory operations..." /> : null}
      {!loading && error ? <ErrorState title="Inventory load failed" description={error} /> : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Tracked Items"
              value={String(itemsCount)}
              subtext="Inventory profiles linked to the live product master."
              icon={<Boxes className="h-5 w-5" />}
              tone="info"
            />
            <StatCard
              label="Reorder Alerts"
              value={String(belowReorder)}
              subtext="Current stock at or below the configured reorder level."
              icon={<PackageSearch className="h-5 w-5" />}
              tone={belowReorder > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Draft Adjustments"
              value={String(draftAdjustments)}
              subtext="Counted adjustments still waiting for approval."
              icon={<ClipboardCheck className="h-5 w-5" />}
              tone={draftAdjustments > 0 ? "warning" : "default"}
            />
            <StatCard
              label="Latest Adjustment"
              value={latestAdjustment?.adjustment_no ?? "No adjustments"}
              subtext={latestAdjustment ? `${latestAdjustment.status} • ${accountingDate(latestAdjustment.adjustment_date)}` : "Approve a stock adjustment to post it into the stock ledger."}
              icon={<ScrollText className="h-5 w-5" />}
            />
          </div>

          <WorkspaceSection
            title="Stock Summary"
            description="Live stock is derived from the additive stock ledger and opening balances, not from product pricing."
          >
            <EnterpriseDataTable
              data={stockSummary}
              columns={summaryColumns}
              emptyTitle="No inventory items found"
              emptyDescription="Create inventory profiles for products that need stock tracking."
            />
          </WorkspaceSection>
        </>
      ) : null}
    </PortalPage>
  );
}
