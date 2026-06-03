import type { ReactNode } from "react";

import PurchaseVendorBridgeReadinessPanel from "@/components/admin/accounting/PurchaseVendorBridgeReadinessPanel";

export default function AdminManufacturingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PurchaseVendorBridgeReadinessPanel
        title="Manufacturing accounting bridge readiness"
        description="Read-only mapping posture for material consumption, finished output, and wastage accounting. This indicator does not change BOMs, issue material, receive finished goods, or create journals."
        eventKeys={["manufacturing_consumption", "manufacturing_output", "manufacturing_wastage"]}
      />
      {children}
    </div>
  );
}
