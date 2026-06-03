import type { ReactNode } from "react";

import PurchaseVendorBridgeReadinessPanel from "@/components/admin/accounting/PurchaseVendorBridgeReadinessPanel";

export default function AdminInventoryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PurchaseVendorBridgeReadinessPanel
        title="Inventory valuation bridge readiness"
        description="Read-only mapping posture for purchase receive, delivery-out COGS, and stock adjustment accounting. This indicator does not change stock quantities, receive stock, approve posting, or create journals."
        eventKeys={[
          "inventory_purchase_receive",
          "inventory_delivery_out",
          "inventory_adjustment_gain",
          "inventory_adjustment_loss",
          "purchase_inventory_receive",
          "purchase_expense",
        ]}
      />
      {children}
    </div>
  );
}
