import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function resolveProfileTarget(role: string | undefined) {
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

export default async function ProfileRedirectPage() {
  const cookieStore = await cookies();
  const role = cookieStore.get("subidha_role")?.value;
  redirect(resolveProfileTarget(role));
}
