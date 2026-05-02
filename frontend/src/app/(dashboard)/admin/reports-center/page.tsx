import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

/** Legacy catalog URL: SME report center now lives on the unified Reports & analysis page. */
export default function AdminReportsCenterRedirectPage() {
  redirect(`${ROUTES.admin.reports}?catalog=1`);
}
