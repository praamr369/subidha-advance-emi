import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

// Compatibility route (legacy singular + misspelling): canonical is /admin/finance/commissions.
export default function AdminPartnerCommisionsRedirect() {
  redirect(ROUTES.admin.financeCommissions);
}
