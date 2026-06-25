import { redirect } from "next/navigation";

// Expense claims moved to HR module — canonical page is /admin/hr/expenses
export default function AccountingExpenseClaimsRedirect() {
  redirect("/admin/hr/expenses");
}
