"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPublicVisitorEvent } from "@/lib/public-api";

let memoryVisitorId = "";

export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";
  const key = "subidha_visitor_id";
  let id: string | null = null;
  try {
    id = localStorage.getItem(key);
  } catch {
    // Private browsing or sandbox security restrictions
    id = memoryVisitorId;
  }

  if (!id) {
    id = "vis_" + Math.random().toString(36).substring(2, 15) + "_" + Date.now().toString(36);
    try {
      localStorage.setItem(key, id);
    } catch {
      // Memory fallback for restricted storage environments
      memoryVisitorId = id;
    }
  }
  return id;
}

export default function PublicVisitorTracker() {
  const pathname = usePathname();
  const lastTracked = useRef<string>("");

  useEffect(() => {
    if (!pathname) return;
    const visitorId = getOrCreateVisitorId();
    if (!visitorId) return;

    // Avoid duplicate triggers on immediate re-renders
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;

    let eventType = "PAGE_VIEW";
    if (pathname.includes("/products/")) {
      eventType = "PRODUCT_VIEW";
    } else if (pathname === "/register") {
      eventType = "REGISTER_PAGE_VIEW";
    }

    // Fire tracking beacon in a non-blocking background task
    trackPublicVisitorEvent({
      session_id: visitorId,
      path: pathname,
      event_type: eventType,
      referrer: typeof document !== "undefined" ? document.referrer : "",
    }).catch(() => {
      // Fail silently without disrupting user experience
    });
  }, [pathname]);

  return null;
}
