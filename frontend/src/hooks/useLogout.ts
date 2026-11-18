"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { getRefreshToken } from "@/lib/auth/session";
import { useAuth } from "@/providers/AuthProvider";
import { logoutRequest } from "@/services/auth.service";

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { logout, role } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
    const isBusiness = ["ADMIN", "PARTNER", "VENDOR", "STAFF", "CASHIER"].includes(
      (role || "").trim().toUpperCase()
    );
    const targetLogin = isBusiness ? (ROUTES.public.businessLogin || "/business/login") : ROUTES.public.login;

    try {
      setIsLoggingOut(true);

      const refreshToken = getRefreshToken();

      try {
        await logoutRequest(refreshToken);
      } catch {
        // Best-effort backend logout only.
        // Local cleanup must still happen.
      }
    } finally {
      // 1. Set flag to prevent double routing from RoleGuard
      if (typeof window !== "undefined") {
        (window as any).__subidha_logging_out = true;
      }
      
      // 2. Clear AuthContext. This causes RoleGuard to unmount the protected dashboard
      // immediately without throwing suspense/query errors.
      logout();
      
      // 3. Now that components are unmounted, it is safe to clear the query cache
      queryClient.clear();

      if (typeof window !== "undefined") {
        // 4. Hard navigation to completely wipe React memory and ensure a clean login page
        window.location.replace(`${targetLogin}?logout=1`);
        return;
      }

      router.replace(targetLogin);
      router.refresh();
      setIsLoggingOut(false);
    }
  }, [logout, queryClient, role, router]);

  return {
    logout: handleLogout,
    isLoggingOut,
  };
}
