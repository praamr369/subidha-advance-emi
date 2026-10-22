"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

export function OfflineNetworkBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    // Register Service Worker for store offline caching
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {});
    }

    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOnline) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="fixed bottom-4 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-500/95 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur transition-all dark:border-amber-600 dark:bg-amber-600/95"
      >
        <WifiOff className="h-4 w-4 shrink-0 animate-pulse text-amber-100" />
        <span>Store Offline — Network disconnected. Retaining typed inputs. System will auto-sync once connection restores.</span>
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-600/95 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur transition-all"
      >
        <Wifi className="h-4 w-4 shrink-0 text-emerald-100" />
        <span>Connected — Back online with SUBIDHA CORE server.</span>
      </div>
    );
  }

  return null;
}

