import type { ReactNode } from "react";

import PurchaseVendorBridgeReadinessPanel from "@/components/admin/accounting/PurchaseVendorBridgeReadinessPanel";

export default function AdminVendorsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PurchaseVendorBridgeReadinessPanel
        title="Vendor accounting bridge readiness"
        description="Read-only mapping posture for vendor purchase bills, vendor payments, and vendor returns. This indicator does not approve posting and does not create journals."
        eventKeys={["vendor_purchase_bill", "vendor_payment", "vendor_return"]}
      />
      {children}
    </div>
  );
}
