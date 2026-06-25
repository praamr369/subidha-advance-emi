// Compatibility alias for the older accounting expense-claims route.
// The live HR workflow is /admin/hr/expenses.
import { redirect } from "next/navigation";

export default function ExpenseClaimsAliasPage() {
  redirect("/admin/hr/expenses");
}
