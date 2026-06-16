// Phase 7: Staff profile source alias.
// /admin/profiles/staff is the Profiles & Parties canonical identity route for staff.
// It redirects to /admin/hr/staff which is the full HR source workflow (staff profile source,
// onboarding workflow, payroll setup, and attendance source). This page must not duplicate
// HR workflow logic and must not create payroll, accounting, or reconciliation records.
import { redirect } from "next/navigation";

export default function ProfilesStaffPage() {
  redirect("/admin/hr/staff");
}
