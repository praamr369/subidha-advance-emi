// Canonical: /admin/service-desk
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function ServiceWorkspaceLegacyPage() { redirect("/admin/service-desk"); }
