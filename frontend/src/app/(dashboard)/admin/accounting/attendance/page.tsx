import { redirect } from "next/navigation";

// Attendance tracking moved to HR module — canonical page is /admin/hr/attendance
export default function AccountingAttendanceRedirect() {
  redirect("/admin/hr/attendance");
}
