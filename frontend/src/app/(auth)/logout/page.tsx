"use client";

import { useEffect } from "react";

import { AuthBrand } from "@/components/auth";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { useLogout } from "@/hooks/useLogout";

export default function LogoutPage() {
  const { logout, isLoggingOut } = useLogout();

  useEffect(() => {
    void logout();
  }, [logout]);

  return (
    <section className="auth-stage flex w-full justify-center py-4 sm:py-8" aria-live="polite">
      <div className="auth-shell relative z-[1] w-full max-w-md p-6 sm:p-8">
        <AuthBrand compact className="mb-6 flex justify-center" />
        <LoadingBlock
          label={isLoggingOut ? "Signing you out securely..." : "Preparing logout..."}
        />
        <p className="mt-4 text-center text-sm leading-6 text-muted-foreground">
          Your session is cleared on this device. Sign in again when you return to a workspace.
        </p>
      </div>
    </section>
  );
}