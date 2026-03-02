"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const role = (localStorage.getItem("user_role") || "").toUpperCase();

    if (!token) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      setAuthorized(false);
      return;
    }

    // ADMIN can access everything
    if (role === "ADMIN") {
      setAuthorized(true);
      return;
    }

    if (pathname.startsWith("/admin") && role !== "ADMIN") {
      router.replace("/unauthorized");
      setAuthorized(false);
      return;
    }

    if (pathname.startsWith("/partner") && role !== "PARTNER") {
      router.replace("/unauthorized");
      setAuthorized(false);
      return;
    }

    if (pathname.startsWith("/customer") && role !== "CUSTOMER") {
      router.replace("/unauthorized");
      setAuthorized(false);
      return;
    }

    if (pathname.startsWith("/cashier") && role !== "CASHIER") {
      router.replace("/unauthorized");
      setAuthorized(false);
      return;
    }

    setAuthorized(true);
  }, [pathname, router]);

  if (authorized === null) return null;
  if (!authorized) return null;

  return <>{children}</>;
}