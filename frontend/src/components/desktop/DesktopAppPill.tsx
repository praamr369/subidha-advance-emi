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
import { subscribeOfflineOutbox } from "@/lib/offline/offline-db";
import { subscribeSyncState, type SyncProgressState } from "@/lib/offline/offline-sync";
import { Monitor, Wifi, WifiOff, RefreshCw, Minus, Plus, Square, X } from "lucide-react";

export default function DesktopAppPill() {
  const [isTauri, setIsTauri] = useState(false);
  const [syncStatus, setSyncStatus] = useState<OfflineSyncStatus>({
    isOnline: true,
    queuedTransactions: 0,
    lastSyncedAt: null,
  });
  const [syncProgress, setSyncProgress] = useState<SyncProgressState | null>(null);

  const { zoom, zoomIn, zoomOut, resetZoom } = useAdminDesktopZoom();
  const zoomPercent = Math.round(parseFloat(zoom || "1.0") * 100);

  useEffect(() => {
    setIsTauri(isTauriDesktop());

    const updateStatus = async () => {
      const status = await getOfflineSyncStatus();
      setSyncStatus(status);
    };

    updateStatus();

    // Subscribe to outbox changes & real-time sync progress
    const unsubscribeOutbox = subscribeOfflineOutbox(() => {
      updateStatus();
    });

    const unsubscribeSync = subscribeSyncState((state) => {
      setSyncProgress(state);
      updateStatus();
    });

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      unsubscribeOutbox();
      unsubscribeSync();
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  const handleSafeClose = async () => {
    if (syncStatus.queuedTransactions > 0) {
      const confirmed = window.confirm(
        `Notice: You have ${syncStatus.queuedTransactions} unsynced transactions in your offline queue.\n\nThey are stored safely on your laptop and will sync when you next reopen the app, but they have not reached the server yet.\n\nClose the desktop app now?`
      );
      if (!confirmed) return;
    }
    await closeWindow();
  };

  return (
    <div className="inline-flex items-center gap-1 sm:gap-1.5">
      {/* 1. In native Linux Desktop ERP mode, show dedicated platform badge */}
      {isTauri && (
        <div
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-2xs"
          title="Running in Native Linux Desktop ERP Mode (Tauri v2)"
        >
          <Monitor className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span className="hidden sm:inline">Linux Desktop</span>
        </div>
      )}

      {/* 2. Interactive Zoom In / Out Controls */}
      <div
        className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 px-1 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 shadow-2xs"
        title="Screen Scaling & Zoom (Ctrl + / Ctrl - / Ctrl 0 / Ctrl Wheel)"
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
          title="Click to reset zoom (Default 100%)"
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
            onClick={handleSafeClose}
            className="rounded p-1 hover:bg-red-500 hover:text-white dark:hover:bg-red-600 cursor-pointer transition-colors"
            title="Close application safely"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
          </button>
        </div>
      )}
    </div>
  );
}
