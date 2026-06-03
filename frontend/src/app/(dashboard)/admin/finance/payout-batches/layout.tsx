import type { ReactNode } from "react";

import CommissionPayoutBridgeReadinessPanel from "@/components/admin/accounting/CommissionPayoutBridgeReadinessPanel";

export default function AdminFinancePayoutBatchesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <CommissionPayoutBridgeReadinessPanel
        title="Payout accounting bridge readiness"
        description="Read-only mapping posture for commission payout and payout batch payment. This indicator does not approve posting and does not create journals."
        eventKeys={["commission_payout", "payout_batch_payment"]}
      />
      {children}
    </div>
  );
}
