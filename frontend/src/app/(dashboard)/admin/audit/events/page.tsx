// Canonical: /admin/audit-logs
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function AuditEventsLegacyPage() { redirect("/admin/audit-logs"); }
