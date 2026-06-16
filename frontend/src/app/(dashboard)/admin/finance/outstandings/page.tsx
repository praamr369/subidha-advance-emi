import { redirect } from "next/navigation";

// Finance source workflow canonical alias.
// /admin/finance/outstandings is the Phase 4 canonical Finance Operations route.
// The authoritative page lives at /admin/outstandings until a dedicated
// finance/outstandings page is built; this redirect keeps both routes working.
export default function AdminFinanceOutstandingsAliasPage() {
  redirect("/admin/outstandings");
}
