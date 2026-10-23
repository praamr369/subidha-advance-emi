import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

// Compatibility redirect: canonical recovery workbench is /admin/recovery-cases/settlement
export default function AdminRecoveryCasesRedirectPage() {
  redirect(ROUTES.admin.recoveryCasesSettlement);
}
