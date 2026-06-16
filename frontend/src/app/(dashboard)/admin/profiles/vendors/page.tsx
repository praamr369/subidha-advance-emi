// Phase 9A: intentionally-preserved compatibility alias (classification: alias).
// Canonical vendor identity path; the legacy content owner /admin/vendors
// (classification: keep_temporarily — procurement register) still hosts the real
// page. Vendor identity/profile is separate from procurement ops. Do not delete.
import { redirect } from "next/navigation";

export default function ProfilesVendorsPage() {
  redirect("/admin/vendors");
}
