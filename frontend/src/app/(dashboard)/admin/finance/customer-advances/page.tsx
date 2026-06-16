import { redirect } from "next/navigation";

// Finance source workflow canonical alias.
// /admin/finance/customer-advances is the Phase 4 canonical Finance Operations route
// for the customer advance liability source register.
// The authoritative page lives at /admin/customer-advances until a dedicated
// finance/customer-advances page is built; this redirect keeps both routes working.
export default function AdminFinanceCustomerAdvancesAliasPage() {
  redirect("/admin/customer-advances");
}
