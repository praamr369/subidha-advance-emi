import { redirect } from "next/navigation";

export default function LegacyAdminOverdueEmiRedirectPage() {
  redirect("/admin/emis/overdue");
}
