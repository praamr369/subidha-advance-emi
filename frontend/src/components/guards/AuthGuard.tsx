"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import LoadingBlock from "@/components/feedback/LoadingBlock";
import { ROUTES } from "@/lib/routes";
import { useAuth } from "@/providers/AuthProvider";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  useEffect(() => { if (!isLoading && !isAuthenticated) router.replace(ROUTES.public.login); }, [isLoading, isAuthenticated, router]);
  if (isLoading) return <LoadingBlock label="Checking session..." />;
  if (!isAuthenticated) return null;
  return <>{children}</>;
}
