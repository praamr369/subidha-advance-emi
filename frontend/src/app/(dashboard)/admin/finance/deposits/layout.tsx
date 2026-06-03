import type { ReactNode } from "react";

import PurchaseVendorBridgeReadinessPanel from "@/components/admin/accounting/PurchaseVendorBridgeReadinessPanel";

export default function AdminFinanceDepositsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PurchaseVendorBridgeReadinessPanel
        title="Deposit refund and damage deduction readiness"
        description="Read-only mapping posture for security deposit refund, damage recovery, and deposit damage deduction. This indicator does not approve refunds, deduct deposits, or create journals."
        eventKeys={["security_deposit_refund", "damage_recovery", "security_deposit_damage_deduction"]}
      />
      {children}
    </div>
  );
}
