import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

// Compatibility route (legacy misspelling): canonical is /admin/finance/commissions.
export default function AdminPartnersCommisionsRedirect() {
  redirect(ROUTES.admin.financeCommissions);
}
