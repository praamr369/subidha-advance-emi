import { redirect } from "next/navigation";

// Leave management moved to HR module — canonical page is /admin/hr/leave
export default function AccountingLeaveRedirect() {
  redirect("/admin/hr/leave");
}
