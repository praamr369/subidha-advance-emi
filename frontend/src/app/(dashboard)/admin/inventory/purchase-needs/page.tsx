"use client";

import { useMemo, useState } from "react";

import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { generatePurchaseNeed, getStockSummary, type StockSummaryRow } from "@/services/inventory";

type NeedRow = {
  product_id: number;
  product_code: string;
  on_hand_qty: string;
  available_qty?: string;
  required_for_confirmed_orders?: string;
  required_for_winners?: string;
  generated_need?: string;
  status?: string;
};

export default function AdminInventoryPurchaseNeedsPage() {
  const [rows, setRows] = useState<NeedRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadNeeds() {
    setLoading(true);
    try {
      const payload = await getStockSummary();
      const source = (payload.results ?? []) as StockSummaryRow[];
      const baseRows: NeedRow[] = source.map((r) => ({
        product_id: r.product_id,
        product_code: r.product_code,
        on_hand_qty: r.on_hand_qty,
        available_qty: r.available_qty,
        required_for_confirmed_orders: r.required_for_confirmed_orders,
        required_for_winners: r.required_for_winners,
      }));
      const generated = await Promise.all(
        baseRows.map(async (row) => {
          const result = await generatePurchaseNeed(row.product_id);
          return {
            ...row,
            generated_need: result.shortage_quantity || "0.000",
            status: result.status || (result.created ? "OPEN" : "NONE"),
          };
        })
      );
      setRows(generated.filter((row) => Number(row.generated_need || 0) > 0));
    } finally {
      setLoading(false);
    }
  }

  const alerts = useMemo(() => rows.length, [rows]);

  return (
    <PortalPage
      title="Inventory Purchase Needs"
      subtitle="Low-stock alerts and purchase needs generated from current availability and demand planning."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Purchase Needs" },
      ]}
      stats={[{ label: "Open Alerts", value: String(alerts), tone: alerts > 0 ? "warning" : "success" }]}
    >
      <div className="mb-4">
        <button
          type="button"
          onClick={() => void loadNeeds()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate Needs"}
        </button>
      </div>
      <WorkspaceSection title="Generated Purchase Needs" description="Advisory output only. Purchase orders remain manual and auditable.">
        <EnterpriseDataTable
          data={rows}
          columns={[
            { key: "product_code", header: "Product" },
            { key: "on_hand_qty", header: "On Hand" },
            { key: "available_qty", header: "Available" },
            { key: "required_for_winners", header: "Required Winners" },
            { key: "required_for_confirmed_orders", header: "Required Orders" },
            { key: "generated_need", header: "Purchase Need Qty" },
            { key: "status", header: "Status" },
          ]}
          emptyTitle="No purchase needs"
          emptyDescription="Generate needs to view low-stock and shortage-based suggestions."
        />
      </WorkspaceSection>
    </PortalPage>
  );
}
