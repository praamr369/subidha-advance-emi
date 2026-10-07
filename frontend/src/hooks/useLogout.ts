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
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
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
      // queryClient.clear(); // Removed to prevent suspense errors on unmount

      if (typeof window !== "undefined") {
        // 4. Hard navigation to completely wipe React memory and ensure a clean login page
        window.location.replace(ROUTES.public.login);
        return;
      }

      router.replace(ROUTES.public.login);
      router.refresh();
      setIsLoggingOut(false);
    }
  }, [logout, queryClient, router]);

  return {
    logout: handleLogout,
    isLoggingOut,
  };
}
