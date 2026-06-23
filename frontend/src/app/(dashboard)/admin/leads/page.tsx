// Canonical: /admin/crm/leads
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function LeadsLegacyPage() { redirect("/admin/crm/leads"); }
