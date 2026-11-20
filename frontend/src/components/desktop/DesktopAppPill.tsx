"use client";

import { useEffect, useState } from "react";
import {
  isTauriDesktop,
  getOfflineSyncStatus,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  type OfflineSyncStatus,
} from "@/lib/desktop/tauri-bridge";
import { useAdminDesktopZoom } from "@/lib/admin-desktop-zoom";
import { Monitor, Wifi, WifiOff, Minus, Plus, Square, X } from "lucide-react";

export default function DesktopAppPill() {
  const [isTauri, setIsTauri] = useState(false);
  const [syncStatus, setSyncStatus] = useState<OfflineSyncStatus>({
    isOnline: true,
    queuedTransactions: 0,
    lastSyncedAt: null,
  });

  const { zoom, zoomIn, zoomOut, resetZoom } = useAdminDesktopZoom();
  const zoomPercent = Math.round(parseFloat(zoom || "0.8") * 100);

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
    <div className="inline-flex items-center gap-1.5">
      {/* 1. App Status & Offline Sync Pill */}
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
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

      {/* 2. Interactive Zoom In / Out Controls */}
      <div
        className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 px-1 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 shadow-2xs"
        title="Screen Scaling & Zoom (Ctrl + / Ctrl - / Ctrl 0)"
      >
        <button
          type="button"
          onClick={zoomOut}
          className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
          title="Zoom Out (Ctrl -)"
          aria-label="Zoom out"
        >
          <Minus className="w-3 h-3 text-slate-600 dark:text-slate-300" />
        </button>

        <button
          type="button"
          onClick={resetZoom}
          className="px-1.5 py-0.5 text-[11px] font-semibold hover:text-primary cursor-pointer transition-colors"
          title="Click to reset zoom (Default 80%)"
        >
          {zoomPercent}%
        </button>

        <button
          type="button"
          onClick={zoomIn}
          className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
          title="Zoom In (Ctrl +)"
          aria-label="Zoom in"
        >
          <Plus className="w-3 h-3 text-slate-600 dark:text-slate-300" />
        </button>
      </div>

      {/* 3. Native Window Controls (Minimize / Maximize / Close) for Linux Desktop */}
      {isTauri && (
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={minimizeWindow}
            className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
            title="Minimize window"
            aria-label="Minimize"
          >
            <Minus className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
          </button>

          <button
            type="button"
            onClick={toggleMaximizeWindow}
            className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
            title="Maximize / Restore window"
            aria-label="Maximize or restore"
          >
            <Square className="w-3 h-3 text-slate-600 dark:text-slate-300" />
          </button>

          <button
            type="button"
            onClick={closeWindow}
            className="rounded p-1 hover:bg-red-500 hover:text-white dark:hover:bg-red-600 cursor-pointer transition-colors"
            title="Close application"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
          </button>
        </div>
      )}
    </div>
  );
}
