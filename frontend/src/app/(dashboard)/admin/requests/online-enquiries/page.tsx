import { redirect } from "next/navigation";

// Phase 6: canonical /admin/requests/online-enquiries alias.
// The legacy /admin/online-enquiries route remains the authoritative page.
export default function RequestsOnlineEnquiriesAliasPage() {
  redirect("/admin/online-enquiries");
}
