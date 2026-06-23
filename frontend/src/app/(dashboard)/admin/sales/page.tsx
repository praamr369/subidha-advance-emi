// Duplicate workspace — canonical route is /admin/billing/direct-sale
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function SalesLegacyPage() { redirect("/admin/billing/direct-sale"); }
