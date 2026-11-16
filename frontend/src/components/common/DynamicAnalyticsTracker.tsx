"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getPublicBusinessProfile } from "@/services/public";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export type UtmAttribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  referrer?: string;
  landing_page?: string;
  captured_at?: string;
};

/**
 * Returns stored marketing/campaign attribution from sessionStorage with localStorage first-touch fallback
 */
export function getStoredUtmAttribution(): UtmAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const rawSession = sessionStorage.getItem("subidha_utm_attribution");
    if (rawSession) {
      return JSON.parse(rawSession) as UtmAttribution;
    }
    const rawLocal = localStorage.getItem("subidha_first_touch_attribution");
    if (rawLocal) {
      return JSON.parse(rawLocal) as UtmAttribution;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Global helper to fire GA4 and Meta Pixel events and connect them with CRM milestones
 * (e.g. generate_lead, view_item, sign_up, contact).
 */
export function trackCrmAnalyticsEvent(
  eventName: "generate_lead" | "view_item" | "sign_up" | "contact" | "begin_checkout" | string,
  params?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;

  // 1. Dispatch custom DOM event for internal listeners
  try {
    window.dispatchEvent(
      new CustomEvent("subidha:analytics_event", { detail: { eventName, params } })
    );
  } catch {
    // Ignore DOM event errors
  }

  // 2. Google Analytics 4 (GA4) event
  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
  }

  // 3. Meta (Facebook) Pixel event
  if (typeof window.fbq === "function") {
    try {
      if (eventName === "generate_lead") {
        window.fbq("track", "Lead", {
          content_name: params?.event_label || params?.product_name || "Lead Enquiry",
          value: params?.value ? Number(params.value) : undefined,
          currency: "INR",
        });
      } else if (eventName === "view_item") {
        window.fbq("track", "ViewContent", {
          content_name: params?.item_name || params?.product_name,
          content_ids: params?.item_id ? [String(params.item_id)] : undefined,
          value: params?.value ? Number(params.value) : undefined,
          currency: "INR",
        });
      } else if (eventName === "sign_up") {
        window.fbq("track", "CompleteRegistration", { status: true });
      } else if (eventName === "contact") {
        window.fbq("trackCustom", "ContactClick", params);
      } else {
        window.fbq("trackCustom", eventName, params);
      }
    } catch {
      // Ignore Meta Pixel dispatch errors
    }
  }
}

/**
 * Security boundary: Never send internal admin, cashier POS, or staff ERP pages
 * or operational data to external analytics trackers.
 */
function isPrivateOperationalRoute(path: string | null): boolean {
  if (!path) return false;
  return (
    path.startsWith("/admin") ||
    path.startsWith("/cashier") ||
    path.startsWith("/vendor") ||
    path.startsWith("/staff")
  );
}

/**
 * Auto-detects traffic channel from search params (UTM, gclid, fbclid) or document.referrer
 */
function resolveAttributionFromEnvironment(currentPath: string): UtmAttribution | null {
  if (typeof window === "undefined" || !window.location) return null;

  const searchParams = new URLSearchParams(window.location.search);
  const utmSource = searchParams.get("utm_source");
  const utmMedium = searchParams.get("utm_medium");
  const utmCampaign = searchParams.get("utm_campaign");
  const utmTerm = searchParams.get("utm_term");
  const utmContent = searchParams.get("utm_content");
  const gclid = searchParams.get("gclid");
  const fbclid = searchParams.get("fbclid");
  const rawReferrer = typeof document !== "undefined" ? document.referrer || "" : "";

  let resolvedSource = utmSource || "";
  let resolvedMedium = utmMedium || "";
  let resolvedCampaign = utmCampaign || "";

  // Auto-detect Google Ads Click ID
  if (!resolvedSource && gclid) {
    resolvedSource = "GOOGLE_ADS";
    resolvedMedium = "cpc";
    resolvedCampaign = "google_campaign";
  }

  // Auto-detect Meta (Facebook/Instagram) Click ID
  if (!resolvedSource && fbclid) {
    resolvedSource = "META_ADS";
    resolvedMedium = "cpc";
    resolvedCampaign = "meta_campaign";
  }

  // Auto-detect organic search and social referrers
  if (!resolvedSource && rawReferrer) {
    const refLower = rawReferrer.toLowerCase();
    if (refLower.includes("google.")) {
      resolvedSource = "GOOGLE_ORGANIC";
      resolvedMedium = "organic";
    } else if (refLower.includes("facebook.") || refLower.includes("instagram.")) {
      resolvedSource = "META_ORGANIC";
      resolvedMedium = "social";
    } else if (refLower.includes("youtube.")) {
      resolvedSource = "YOUTUBE";
      resolvedMedium = "social";
    } else if (refLower.includes("whatsapp") || refLower.includes("wa.me")) {
      resolvedSource = "WHATSAPP";
      resolvedMedium = "chat";
    } else if (!refLower.includes(window.location.hostname)) {
      resolvedSource = "REFERRAL";
      resolvedMedium = "web";
    }
  }

  if (resolvedSource || rawReferrer || gclid || fbclid) {
    return {
      utm_source: resolvedSource.slice(0, 50),
      utm_medium: resolvedMedium.slice(0, 50),
      utm_campaign: resolvedCampaign.slice(0, 100),
      utm_term: (utmTerm || "").slice(0, 100),
      utm_content: (utmContent || "").slice(0, 100),
      gclid: (gclid || "").slice(0, 100),
      fbclid: (fbclid || "").slice(0, 100),
      referrer: rawReferrer.slice(0, 200),
      landing_page: currentPath.slice(0, 200),
      captured_at: new Date().toISOString(),
    };
  }

  return null;
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
  const initializedMetaRef = useRef<string | null>(null);

  // Capture UTM parameters and advertising click IDs into session & local storage
  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;
    if (isPrivateOperationalRoute(pathname)) return;

    try {
      const attribution = resolveAttributionFromEnvironment(pathname);
      if (attribution) {
        sessionStorage.setItem("subidha_utm_attribution", JSON.stringify(attribution));
        if (!localStorage.getItem("subidha_first_touch_attribution")) {
          localStorage.setItem("subidha_first_touch_attribution", JSON.stringify(attribution));
        }
      }
    } catch {
      // Ignore storage errors in restricted private mode
    }
  }, [pathname]);

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

  const metaPixelId = (profile?.meta_pixel_id || "").trim();

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
    if (isPrivateOperationalRoute(pathname)) return;
    if (!gaId || typeof window === "undefined" || typeof document === "undefined") return;

    if (initializedGaRef.current !== gaId) {
      initializedGaRef.current = gaId;

      window.dataLayer = window.dataLayer || [];
      if (!window.gtag) {
        window.gtag = function gtag(...args: unknown[]) {
          window.dataLayer?.push(args);
        };
      }

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
      window.gtag("config", gaId, {
        page_path: pathname || "/",
      });
    }
  }, [gaId, pathname]);

  // 3. Meta (Facebook) Pixel Injection & Configuration
  useEffect(() => {
    if (isPrivateOperationalRoute(pathname)) return;
    if (!metaPixelId || typeof window === "undefined" || typeof document === "undefined") return;

    if (initializedMetaRef.current !== metaPixelId) {
      initializedMetaRef.current = metaPixelId;

      const injectMetaPixel = () => {
        if (!window.fbq) {
          type FbqFunction = {
            (...args: unknown[]): void;
            callMethod?: (...args: unknown[]) => void;
            queue: unknown[];
            push: unknown;
            loaded: boolean;
            version: string;
          };
          const fbq = function (...args: unknown[]) {
            if ((fbq as FbqFunction).callMethod) {
              (fbq as FbqFunction).callMethod?.(...args);
            } else {
              (fbq as FbqFunction).queue.push(args);
            }
          } as FbqFunction;
          fbq.push = fbq;
          fbq.loaded = true;
          fbq.version = "2.0";
          fbq.queue = [];
          window.fbq = fbq;
          window._fbq = fbq;

          const scriptId = "dynamic-meta-pixel-script";
          let scriptTag = document.getElementById(scriptId) as HTMLScriptElement | null;
          if (!scriptTag) {
            scriptTag = document.createElement("script");
            scriptTag.id = scriptId;
            scriptTag.src = "https://connect.facebook.net/en_US/fbevents.js";
            scriptTag.async = true;
            document.head.appendChild(scriptTag);
          }
        }

        window.fbq?.("init", metaPixelId);
        window.fbq?.("track", "PageView");
      };

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(injectMetaPixel, { timeout: 3000 });
      } else {
        setTimeout(injectMetaPixel, 1500);
      }
    } else if (window.fbq) {
      window.fbq("track", "PageView");
    }
  }, [metaPixelId, pathname]);

  return null;
}
