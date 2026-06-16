import type { ReactNode } from "react";

import PayrollBridgeReadinessPanel from "@/components/admin/accounting/PayrollBridgeReadinessPanel";

export default function AdminHrLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PayrollBridgeReadinessPanel
        title="Payroll accounting bridge status"
        description="Read-only mapping posture for salary accrual, salary payment, staff advance, and employee expense claim payment. This is a readiness indicator only — it does not calculate payroll, approve salary, post journals, or create reconciliation evidence. Reconciliation evidence lives in Accounting & Reconciliation."
        eventKeys={["salary_expense", "salary_payable", "salary_payment", "staff_advance", "expense_claim_payment"]}
      />
      {children}
    </div>
  );
}
