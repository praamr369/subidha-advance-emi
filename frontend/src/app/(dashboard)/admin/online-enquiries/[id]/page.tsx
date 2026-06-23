// Canonical route moved to /admin/requests/online-enquiries/[id]
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function OnlineEnquiryDetailLegacyPage() { redirect("/admin/requests/online-enquiries"); }
