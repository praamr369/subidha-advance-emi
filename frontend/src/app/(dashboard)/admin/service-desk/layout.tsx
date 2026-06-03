import type { ReactNode } from "react";

import PurchaseVendorBridgeReadinessPanel from "@/components/admin/accounting/PurchaseVendorBridgeReadinessPanel";

export default function AdminServiceDeskLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PurchaseVendorBridgeReadinessPanel
        title="Returns, damage & customer credit readiness"
        description="Read-only mapping posture for customer returns, sales returns, credit notes, refunds, and damage recovery. This indicator does not approve returns, issue credit notes, pay refunds, or create journals."
        eventKeys={[
          "customer_return",
          "sales_return",
          "credit_note_issue",
          "customer_refund",
          "customer_credit_adjustment",
          "damage_recovery",
        ]}
      />
      {children}
    </div>
  );
}
