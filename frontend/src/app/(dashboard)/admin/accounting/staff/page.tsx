import { redirect } from "next/navigation";

// Staff management moved to HR module — canonical page is /admin/hr/staff
export default function AccountingStaffRedirect() {
  redirect("/admin/hr/staff");
}
