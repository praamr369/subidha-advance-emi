// Phase 9A: intentionally-preserved compatibility alias (classification: alias).
// Canonical Profiles & Parties path; the legacy content owner /admin/crm/parties
// (classification: keep_temporarily) still hosts the party directory. Do not delete.
import { redirect } from "next/navigation";

export default function ProfilesPartiesPage() {
  redirect("/admin/crm/parties");
}
