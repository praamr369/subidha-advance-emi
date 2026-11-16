"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getPublicBusinessProfile } from "@/services/public";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Extracts the clean token if the user pasted a raw HTML <meta> tag
 * e.g. <meta name="google-site-verification" content="token_here" /> -> token_here
 */
function cleanSearchConsoleToken(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/content=["']([^"']+)["']/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return trimmed;
}

export function DynamicAnalyticsTracker() {
  const pathname = usePathname();
  const initializedGaRef = useRef<string | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["public-business-profile-analytics"],
    queryFn: async () => {
      try {
        return await getPublicBusinessProfile();
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const gaId =
    (profile?.google_analytics_id || "").trim() ||
    (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "").trim();

  const gscToken = cleanSearchConsoleToken(
    (profile?.google_search_console_id || "").trim()
  );

  // 1. Google Search Console Verification Meta Tag
  useEffect(() => {
    if (!gscToken || typeof document === "undefined") return;

    let metaTag = document.querySelector<HTMLMetaElement>(
      'meta[name="google-site-verification"]'
    );
    if (!metaTag) {
      metaTag = document.createElement("meta");
      metaTag.name = "google-site-verification";
      document.head.appendChild(metaTag);
    }
    metaTag.content = gscToken;
  }, [gscToken]);

  // 2. Google Analytics 4 (GA4) Injection & Configuration
  useEffect(() => {
    if (!gaId || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    if (initializedGaRef.current !== gaId) {
      initializedGaRef.current = gaId;

      // Ensure dataLayer exists
      window.dataLayer = window.dataLayer || [];
      if (!window.gtag) {
        window.gtag = function gtag(...args: unknown[]) {
          window.dataLayer?.push(args);
        };
      }

      // Defers script injection to idle time to protect mobile TBT / hydration
      const injectGtag = () => {
        const scriptId = "dynamic-gtag-script";
        let scriptTag = document.getElementById(scriptId) as HTMLScriptElement | null;
        if (!scriptTag) {
          scriptTag = document.createElement("script");
          scriptTag.id = scriptId;
          scriptTag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
            gaId
          )}`;
          scriptTag.async = true;
          document.head.appendChild(scriptTag);
        }

        window.gtag?.("js", new Date());
        window.gtag?.("config", gaId, {
          page_path: pathname || "/",
          send_page_view: true,
        });
      };

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(injectGtag, { timeout: 3000 });
      } else {
        setTimeout(injectGtag, 1500);
      }
    } else if (window.gtag) {
      // Route change page view
      window.gtag("config", gaId, {
        page_path: pathname || "/",
      });
    }
  }, [gaId, pathname]);

  return null;
}
