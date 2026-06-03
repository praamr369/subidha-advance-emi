import type { ReactNode } from "react";

import CommissionPayoutBridgeReadinessPanel from "@/components/admin/accounting/CommissionPayoutBridgeReadinessPanel";

export default function AdminFinanceCommissionsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <CommissionPayoutBridgeReadinessPanel
        title="Commission accounting bridge readiness"
        description="Read-only mapping posture for commission accrual and approval. This indicator does not approve posting and does not create journals."
        eventKeys={["commission_accrual", "commission_approval"]}
      />
      {children}
    </div>
  );
}
