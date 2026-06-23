// Duplicate — same component as /admin/billing/direct-sale
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function BillingDirectSalesLegacyPage() { redirect("/admin/billing/direct-sale"); }
