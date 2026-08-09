import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

// Compatibility route: canonical commissions page is /admin/finance/commissions.
export default function AdminPartnersCommissionsRedirect() {
  redirect(ROUTES.admin.financeCommissions);
}
