import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function resolveSettingsTarget(role: string | undefined) {
  switch ((role || "").trim().toUpperCase()) {
    case "ADMIN":
      return "/admin/settings";
    case "CUSTOMER":
      return "/customer/profile";
    case "PARTNER":
      return "/partner";
    case "CASHIER":
      return "/cashier";
    default:
      return "/login";
  }
}

export default async function SettingsRedirectPage() {
  const cookieStore = await cookies();
  const role = cookieStore.get("subidha_role")?.value;
  redirect(resolveSettingsTarget(role));
}
