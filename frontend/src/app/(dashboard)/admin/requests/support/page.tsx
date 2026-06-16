import { redirect } from "next/navigation";

// Phase 6: canonical /admin/requests/support alias.
// The legacy /admin/support-requests route remains the authoritative page.
export default function RequestsSupportAliasPage() {
  redirect("/admin/support-requests");
}
