"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  allowedRoles: string[];
  children: React.ReactNode;
};

export default function RoleGuard({ allowedRoles, children }: Props) {
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const role = localStorage.getItem("user_role");

    if (!role) {
      router.replace("/login");
      return;
    }

    if (allowedRoles.includes(role)) {
      setIsAllowed(true);
    } else {
      router.replace("/login");
    }
  }, [allowedRoles, router]);

  if (isAllowed === null) {
    return null; // Prevent flash redirect
  }

  return <>{children}</>;
}