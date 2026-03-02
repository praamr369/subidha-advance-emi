"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useAuthGuard(requiredRole: string) {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("user_role");

    if (!token) {
      router.push("/login");
      return;
    }

    if (requiredRole && role !== requiredRole) {
      router.push("/unauthorized");
    }
  }, [requiredRole, router]);
}