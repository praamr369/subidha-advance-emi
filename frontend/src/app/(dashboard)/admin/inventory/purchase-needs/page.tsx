"use client";

import { useMemo, useState } from "react";

import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { listAdminInventoryRequirements } from "@/services/direct-sale-workspace";

type NeedRow = {
  id: number;
  product_id: number;
  product_name: string;
  source_module: string;
  required_quantity: string;
  available_quantity: string;
  shortage_quantity: string;
  customer_name?: string | null;
  priority: string;
  status: string;
  created_at: string;
};

export default function AdminInventoryPurchaseNeedsPage() {
  const [rows, setRows] = useState<NeedRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadNeeds() {
    setLoading(true);
    try {
      const payload = await listAdminInventoryRequirements({ status: "OPEN" });
      setRows(payload.results);
    } finally {
      setLoading(false);
    }
  }

  const alerts = useMemo(() => rows.length, [rows]);

  return (
    <PortalPage
      title="Inventory Purchase Needs"
      subtitle="Required products and inventory needs generated from direct sale and other demand sources."
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
          {loading ? "Refreshing..." : "Refresh Needs"}
        </button>
      </div>
      <WorkspaceSection title="Required Products / Inventory Needs" description="Read-only operational feed. Purchase execution remains manual and auditable.">
        <EnterpriseDataTable
          data={rows}
          columns={[
            { key: "product_name", header: "Product" },
            { key: "source_module", header: "Source" },
            { key: "required_quantity", header: "Required Qty" },
            { key: "available_quantity", header: "Available Qty" },
            { key: "shortage_quantity", header: "Shortage Qty" },
            { key: "customer_name", header: "Customer / Ref" },
            { key: "priority", header: "Priority" },
            { key: "status", header: "Status" },
            { key: "created_at", header: "Created" },
          ]}
          emptyTitle="No purchase needs"
          emptyDescription="No open inventory requirements at the moment."
        />
      </WorkspaceSection>
    </PortalPage>
  );
}
