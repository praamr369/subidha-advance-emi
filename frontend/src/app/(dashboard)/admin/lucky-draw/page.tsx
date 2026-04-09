import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

export default function LegacyAdminLuckyDrawRedirectPage() {
  redirect(ROUTES.admin.luckyDraws);
}
