// Canonical route moved to /admin/requests/support/[id]
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function SupportRequestDetailLegacyPage() { redirect("/admin/requests/support"); }
