import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function RedirectPoliciesPage() {
  redirect(ROUTES.admin.settingsCompliancePolicies);
}
