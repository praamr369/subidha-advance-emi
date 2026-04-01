"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { getRefreshToken } from "@/lib/auth/session";
import { useAuth } from "@/providers/AuthProvider";
import { logoutRequest } from "@/services/auth.service";

export function useLogout() {
  const router = useRouter();
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
      logout();

      if (typeof window !== "undefined") {
        window.location.replace(ROUTES.public.login);
        return;
      }

      router.replace(ROUTES.public.login);
      router.refresh();
      setIsLoggingOut(false);
    }
  }, [logout, router]);

  return {
    logout: handleLogout,
    isLoggingOut,
  };
}
