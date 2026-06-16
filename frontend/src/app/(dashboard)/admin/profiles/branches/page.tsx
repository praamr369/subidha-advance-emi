// Phase 9A: intentionally-preserved compatibility alias (classification: alias).
// Canonical Profiles & Parties path; the legacy content owner /admin/branches
// (classification: keep_temporarily) still hosts the real page. Do not delete.
import { redirect } from "next/navigation";

export default function ProfilesBranchesPage() {
  redirect("/admin/branches");
}
