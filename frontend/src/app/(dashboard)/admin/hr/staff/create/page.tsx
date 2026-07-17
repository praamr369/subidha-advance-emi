"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/routes";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

export default function RedirectToStaffList() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the HR staff page where the "Recruit staff" drawer is located.
    router.replace(ROUTES.admin.hrStaff);
  }, [router]);

  return (
    <ERPPageShell title="Staff Profile">
      <ERPLoadingState label="Redirecting to staff register..." />
    </ERPPageShell>
  );
}
