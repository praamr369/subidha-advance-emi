import { useMemo } from "react";

export function useAdminAuth() {
  const token = typeof window === "undefined" ? null : localStorage.getItem("access_token");
  const role = typeof window === "undefined" ? "" : (localStorage.getItem("user_role") || "").toUpperCase();

  const isAdmin = useMemo(() => role === "ADMIN", [role]);

  return {
    token,
    role,
    isAuthenticated: Boolean(token),
    isAdmin,
  };
}
