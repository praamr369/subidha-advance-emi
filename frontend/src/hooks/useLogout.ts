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
      queryClient.clear();
      // Clear React context, local storage, tokens, and auth cookies together.
      // Keeping the provider authenticated during navigation leaves protected
      // shells mounted and can make the next login appear to be a broken app.
      if (typeof window !== "undefined") {
        (window as any).__subidha_logging_out = true;
      }
      logout();

      if (typeof window !== "undefined") {
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
