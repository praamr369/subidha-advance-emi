"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { useAuth } from "@/providers/AuthProvider";

export function useAuthGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      const isBusiness =
        pathname?.startsWith("/admin") ||
        pathname?.startsWith("/partner") ||
        pathname?.startsWith("/vendor") ||
        pathname?.startsWith("/staff") ||
        pathname?.startsWith("/cashier");
      const target = isBusiness ? (ROUTES.public.businessLogin || "/business/login") : ROUTES.public.login;
      router.replace(target);
    }
  }, [isAuthenticated, isLoading, pathname, router]);
}