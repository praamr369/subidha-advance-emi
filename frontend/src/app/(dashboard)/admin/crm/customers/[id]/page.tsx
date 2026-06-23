// Canonical: /admin/customers/[id]
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function CrmCustomerDetailLegacyPage() { redirect("/admin/customers"); }
