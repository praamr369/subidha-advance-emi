import { ROUTES } from "@/lib/routes";

function normalizeRole(role: string | null | undefined): string {
  return (role || "").trim().toUpperCase();
}

export function getDashboardRouteForRole(role: string | null | undefined): string {
  switch (normalizeRole(role)) {
    case "ADMIN":
      return ROUTES.admin.dashboard;
    case "PARTNER":
      return ROUTES.partner.dashboard;
    case "CUSTOMER":
      return ROUTES.customer.dashboard;
    case "CASHIER":
      return ROUTES.cashier.dashboard;
    case "VENDOR":
      return ROUTES.vendor.dashboard;
    case "STAFF":
      return ROUTES.staff.dashboard;
    default:
      return ROUTES.public.home;
  }
}
