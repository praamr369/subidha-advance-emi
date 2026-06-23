// Canonical delivery list: /admin/deliveries
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function DeliveryWorkspaceLegacyPage() { redirect("/admin/deliveries"); }
