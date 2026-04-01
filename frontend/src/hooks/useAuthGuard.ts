"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { useAuth } from "@/providers/AuthProvider";

export function useAuthGuard() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace(ROUTES.public.login);
    }
  }, [isAuthenticated, isLoading, router]);
}