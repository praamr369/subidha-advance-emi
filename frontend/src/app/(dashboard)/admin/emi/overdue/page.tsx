import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

// Compatibility route (legacy singular): canonical overdue EMI page is /admin/emis/overdue.
export default function AdminEmiOverdueRedirect() {
  redirect(ROUTES.admin.emisOverdue);
}
