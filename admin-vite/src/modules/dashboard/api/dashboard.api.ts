import { api } from "@/shared/api/http-client";
import type { AdminDashboardResponse } from "./dashboard.types";

export function fetchAdminDashboard() {
  return api.get<AdminDashboardResponse>("/admin/dashboard/");
}
