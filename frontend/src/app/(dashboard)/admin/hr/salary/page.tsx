import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function AdminHrSalaryRedirectPage() {
  redirect(ROUTES.admin.hrPayroll);
}
