"use client";

import { useEffect, useState } from "react";

import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { getProductDemandPlanning, getStockSummary, type ProductDemandPlanning, type StockSummaryRow } from "@/services/inventory";

type DemandRow = ProductDemandPlanning & { product_code: string; product_name: string };

export default function AdminInventoryDemandPlanningPage() {
  const [rows, setRows] = useState<DemandRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const summary = await getStockSummary();
      const stockRows: StockSummaryRow[] = summary.results ?? [];
      const payload = await Promise.all(
        stockRows.slice(0, 100).map(async (row) => {
          const demand = await getProductDemandPlanning(row.product_id);
          return { ...demand, product_code: row.product_code, product_name: row.product_name };
        })
      );
      if (!cancelled) setRows(payload);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PortalPage
      title="Inventory Demand Planning"
      subtitle="Read-only demand projection from active subscriptions, locked batches, winners, direct sales, and rent/lease commitments."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Demand Planning" },
      ]}
    >
      <WorkspaceSection title="Demand by Product" description="Projection only. No finance or posting behavior is mutated.">
        <EnterpriseDataTable
          data={rows}
          columns={[
            { key: "product_code", header: "Product" },
            { key: "active_subscriptions", header: "Active Subscriptions" },
            { key: "locked_batch_demand", header: "Locked Batch Demand" },
            { key: "winners_pending_delivery", header: "Winners Pending Delivery" },
            { key: "direct_sale_orders", header: "Direct Sale Orders" },
            { key: "rent_lease_commitments", header: "Rent/Lease Commitments" },
            { key: "total_required", header: "Total Required" },
          ]}
          emptyTitle="No demand rows"
          emptyDescription="No stock-tracked products were found."
        />
      </WorkspaceSection>
    </PortalPage>
  );
}
