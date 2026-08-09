import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

// Compatibility route (legacy singular): canonical is /admin/finance/commissions.
export default function AdminPartnerCommissionsRedirect() {
  redirect(ROUTES.admin.financeCommissions);
}
