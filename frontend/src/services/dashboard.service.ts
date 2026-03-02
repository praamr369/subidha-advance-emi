import { apiFetch } from "@/lib/api";

export async function getExecutiveDashboard() {
  return apiFetch("/admin");
}