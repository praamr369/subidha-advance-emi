import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

// Compatibility route: canonical reconciliation is /admin/accounting/bridge-reconciliation.
export default function AdminFinanceReconciliationRedirect() {
  redirect(ROUTES.admin.accountingBridgeReconciliation);
}
