"use client";

import { useEffect } from "react";

import LoadingBlock from "@/components/feedback/LoadingBlock";
import { useLogout } from "@/hooks/useLogout";

export default function LogoutPage() {
  const { logout, isLoggingOut } = useLogout();

  useEffect(() => {
    void logout();
  }, [logout]);

  return (
    <div className="p-6">
      <LoadingBlock
        label={isLoggingOut ? "Signing you out..." : "Preparing logout..."}
      />
    </div>
  );
}