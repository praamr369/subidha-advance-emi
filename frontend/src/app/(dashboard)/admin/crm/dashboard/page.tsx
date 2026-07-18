"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function DashboardRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to unified CRM page
    router.replace(ROUTES.admin.crmWorkspace);
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p className="text-muted-foreground">Redirecting to CRM Dashboard...</p>
      </div>
    </div>
  );
}
