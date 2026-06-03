import type { ReactNode } from "react";

import PayrollBridgeReadinessPanel from "@/components/admin/accounting/PayrollBridgeReadinessPanel";

export default function AdminHrLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PayrollBridgeReadinessPanel
        title="HR & payroll accounting bridge readiness"
        description="Read-only mapping posture for salary accrual, salary payment, staff advance, and employee expense claim payment. This indicator does not calculate payroll, approve salary, or create journals."
        eventKeys={["salary_expense", "salary_payable", "salary_payment", "staff_advance", "expense_claim_payment"]}
      />
      {children}
    </div>
  );
}
