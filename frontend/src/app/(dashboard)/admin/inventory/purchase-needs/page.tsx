"use client";

import { useMemo, useState } from "react";

import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
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
    <ERPPageShell
      eyebrow="Inventory"
      title="Inventory Purchase Needs"
      subtitle="Required products and inventory needs generated from direct sale and other demand sources."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Purchase Needs" },
      ]}
      stats={[{ label: "Open Alerts", value: String(alerts), tone: alerts > 0 ? "warning" : "success" }]}
    >
      <ERPDataToolbar
        left={<div className="text-sm text-muted-foreground">Operational feed (read-only).</div>}
        right={
          <button
            type="button"
            onClick={() => void loadNeeds()}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-border hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh Needs"}
          </button>
        }
        className="mb-4"
      />

      <ERPSectionShell
        title="Required Products / Inventory Needs"
        description="Read-only operational feed. Purchase execution remains manual and auditable."
      >
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
      </ERPSectionShell>
    </ERPPageShell>
  );
}
