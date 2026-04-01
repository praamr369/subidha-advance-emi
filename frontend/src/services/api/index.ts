import { apiFetch } from "@/lib/api";

export async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  return apiFetch<T>(path, options);
}