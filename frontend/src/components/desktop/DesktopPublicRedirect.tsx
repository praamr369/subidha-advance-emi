"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isTauriDesktop } from "@/lib/desktop/tauri-bridge";

/**
 * Desktop App Navigation Guard:
 * When running inside the native Linux desktop application (Tauri),
 * public consumer pages (landing, marketing, brochures) are disabled.
 * The desktop window is strictly locked to business admin operations (/admin).
 */
export default function DesktopPublicRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (isTauriDesktop()) {
      router.replace("/admin");
    }
  }, [router]);

  return null;
}
