import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

/** Legacy analytics URL: live dashboard posture is embedded in the unified Reports & analysis page. */
export default function AdminAnalyticsRedirectPage() {
  redirect(`${ROUTES.admin.reports}?live=1`);
}
