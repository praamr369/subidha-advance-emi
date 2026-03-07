"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { logout } from "@/lib/api";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    logout();
    router.replace("/login");
  }, [router]);

  return <p style={{ padding: 24 }}>Signing out...</p>;
}
