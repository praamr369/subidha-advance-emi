// Canonical route moved to /admin/requests/online-enquiries
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function OnlineEnquiriesLegacyPage() { redirect("/admin/requests/online-enquiries"); }
