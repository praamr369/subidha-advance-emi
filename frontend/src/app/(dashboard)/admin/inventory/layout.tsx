import type { ReactNode } from "react";

import PurchaseVendorBridgeReadinessPanel from "@/components/admin/accounting/PurchaseVendorBridgeReadinessPanel";

export default function AdminInventoryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PurchaseVendorBridgeReadinessPanel
        title="Purchase inventory bridge readiness"
        description="Read-only mapping posture for purchase inventory receive and purchase expense readiness. This indicator does not receive stock, approve posting, or create journals."
        eventKeys={["purchase_inventory_receive", "inventory_purchase_receive", "purchase_expense"]}
      />
      {children}
    </div>
  );
}
