// Superseded by /admin/settings/roles-permissions (live API-backed page)
// HTTP redirect configured in next.config.ts
import { redirect } from "next/navigation";
export default function SettingsRolesLegacyPage() { redirect("/admin/settings/roles-permissions"); }
