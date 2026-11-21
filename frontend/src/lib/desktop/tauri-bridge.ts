/**
 * Desktop Tauri v2 Bridge for SUBIDHA CORE.
 * Provides safe detection, window controls, and offline status
 * across Web, PWA, and Native Tauri Desktop runtimes.
 */

import { getAllOutboxItems } from "@/lib/offline/offline-db";

export interface DesktopSystemInfo {
  appName: string;
  version: string;
  os: string;
  isDesktop: boolean;
}

export interface OfflineSyncStatus {
  isOnline: boolean;
  queuedTransactions: number;
  lastSyncedAt?: string | null;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
  }
}

/**
 * Check if running inside the native Tauri desktop webview.
 */
export function isTauriDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.__TAURI_INTERNALS__);
}

/**
 * Native Desktop Window Controls (Minimize / Maximize / Close)
 */
export async function minimizeWindow(): Promise<void> {
  if (!isTauriDesktop()) return;
  try {
    await window.__TAURI_INTERNALS__!.invoke("minimize_window");
  } catch (err) {
    console.warn("Failed to minimize window:", err);
  }
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauriDesktop()) return;
  try {
    await window.__TAURI_INTERNALS__!.invoke("toggle_maximize_window");
  } catch (err) {
    console.warn("Failed to toggle maximize window:", err);
  }
}

export async function closeWindow(): Promise<void> {
  if (!isTauriDesktop()) return;
  try {
    await window.__TAURI_INTERNALS__!.invoke("close_window");
  } catch (err) {
    console.warn("Failed to close window:", err);
  }
}

/**
 * Native GPU-accelerated Webview Zoom Scaling.
 * Unlike CSS zoom which causes CPU-bound reflows on WebKit,
 * this scales the webview surface directly in the compositor.
 */
export async function setNativeDesktopZoom(factor: number): Promise<void> {
  if (!isTauriDesktop()) return;
  try {
    await window.__TAURI_INTERNALS__!.invoke("set_desktop_zoom", { factor });
  } catch (err) {
    console.warn("Failed to set native desktop zoom:", err);
  }
}

/**
 * Fetch desktop runtime metadata.
 */
export async function getDesktopSystemInfo(): Promise<DesktopSystemInfo> {
  if (!isTauriDesktop()) {
    return {
      appName: "SUBIDHA CORE (Web/PWA)",
      version: "0.1.0",
      os: typeof navigator !== "undefined" ? navigator.platform : "unknown",
      isDesktop: false,
    };
  }

  try {
    const res = await window.__TAURI_INTERNALS__!.invoke<{
      app_name: string;
      version: string;
      os: string;
      is_desktop: boolean;
    }>("get_system_info");

    return {
      appName: res.app_name,
      version: res.version,
      os: res.os,
      isDesktop: res.is_desktop,
    };
  } catch {
    return {
      appName: "SUBIDHA CORE (Desktop)",
      version: "0.1.0",
      os: "Linux",
      isDesktop: true,
    };
  }
}

/**
 * Check local offline sync status and queued transactions.
 */
export async function getOfflineSyncStatus(): Promise<OfflineSyncStatus> {
  let pendingCount = 0;
  try {
    const outbox = await getAllOutboxItems();
    pendingCount = outbox.filter((item) => item.status === "PENDING" || item.status === "FAILED").length;
  } catch {
    pendingCount = 0;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      isOnline: false,
      queuedTransactions: pendingCount,
      lastSyncedAt: null,
    };
  }

  if (isTauriDesktop()) {
    try {
      const res = await window.__TAURI_INTERNALS__!.invoke<{
        is_online: boolean;
        queued_transactions: number;
        last_synced_at?: string;
      }>("get_offline_status");

      return {
        isOnline: res.is_online,
        queuedTransactions: Math.max(pendingCount, res.queued_transactions),
        lastSyncedAt: res.last_synced_at ?? null,
      };
    } catch {
      // fallback to browser detection
    }
  }

  return {
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    queuedTransactions: pendingCount,
    lastSyncedAt: new Date().toISOString(),
  };
}
