// Canonical route moved to /admin/requests/support
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function SupportRequestsLegacyPage() { redirect("/admin/requests/support"); }
