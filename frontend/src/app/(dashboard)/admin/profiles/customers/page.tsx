// Phase 9A: intentionally-preserved compatibility alias (classification: alias).
// Canonical Profiles & Parties path; the legacy content owner /admin/customers
// (classification: keep_temporarily) still hosts the real page. Do not delete.
import { redirect } from "next/navigation";

export default function ProfilesCustomersPage() {
  redirect("/admin/customers");
}
