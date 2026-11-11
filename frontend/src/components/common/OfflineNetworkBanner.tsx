"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi, RefreshCw } from "lucide-react";

export function OfflineNetworkBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    // Register Service Worker for counter offline caching
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {});
    }

    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 5000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
      setSyncNotice(null);
    };

    const handleSyncComplete = (event: Event) => {
      const customEvent = event as CustomEvent<{ synced: number; failed: number }>;
      const { synced, failed } = customEvent.detail || { synced: 0, failed: 0 };
      if (synced > 0 || failed > 0) {
        setSyncNotice(
          `Reconnected: Synced ${synced} offline transaction(s)${failed > 0 ? ` (${failed} require review)` : ""}.`
        );
        const timer = setTimeout(() => setSyncNotice(null), 6000);
        return () => clearTimeout(timer);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("subidha-sync-complete", handleSyncComplete);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("subidha-sync-complete", handleSyncComplete);
    };
  }, []);

  if (!isOnline) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="fixed bottom-4 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-600/95 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur transition-all dark:border-amber-600 dark:bg-amber-600/95"
      >
        <WifiOff className="h-4 w-4 shrink-0 animate-pulse text-amber-100" />
        <span>Counter Offline — Sales, stock audits, & purchases will queue locally and auto-sync when online.</span>
      </div>
    );
  }

  if (syncNotice) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-600/95 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur transition-all"
      >
        <RefreshCw className="h-4 w-4 shrink-0 text-emerald-100 animate-spin" />
        <span>{syncNotice}</span>
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
        <span>Back Online — Connected to SUBIDHA CORE database.</span>
      </div>
    );
  }

  return null;
}
