"use client";

import { useEffect, useState } from "react";
import { isTauriDesktop, getOfflineSyncStatus, type OfflineSyncStatus } from "@/lib/desktop/tauri-bridge";
import { Monitor, Wifi, WifiOff } from "lucide-react";

export default function DesktopAppPill() {
  const [isTauri, setIsTauri] = useState(false);
  const [syncStatus, setSyncStatus] = useState<OfflineSyncStatus>({
    isOnline: true,
    queuedTransactions: 0,
    lastSyncedAt: null,
  });

  useEffect(() => {
    setIsTauri(isTauriDesktop());

    const updateStatus = async () => {
      const status = await getOfflineSyncStatus();
      setSyncStatus(status);
    };

    updateStatus();

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        syncStatus.isOnline
          ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 animate-pulse"
      }`}
      title={
        isTauri
          ? "Running in Native Linux Desktop ERP Mode (Tauri v2)"
          : "Running in Web/PWA Mode"
      }
    >
      <Monitor className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
      <span>{isTauri ? "Linux Desktop" : "Web ERP"}</span>

      <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />

      {syncStatus.isOnline ? (
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <Wifi className="w-3 h-3" />
          <span>Synced</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
          <WifiOff className="w-3 h-3" />
          <span>Offline ({syncStatus.queuedTransactions} queued)</span>
        </span>
      )}
    </div>
  );
}
