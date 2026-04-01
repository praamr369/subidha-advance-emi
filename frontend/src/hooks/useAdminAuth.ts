"use client";

import { useAuth } from "@/providers/AuthProvider";

export function useAdminAuth() {
  const { role, isAuthenticated } = useAuth();

  return {
    isAdmin: isAuthenticated && role === "ADMIN",
  };
}