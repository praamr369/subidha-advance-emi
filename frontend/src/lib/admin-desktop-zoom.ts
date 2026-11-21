// frontend/src/lib/admin-desktop-zoom.ts
"use client";

import { useSyncExternalStore } from "react";
import { isTauriDesktop, setNativeDesktopZoom } from "@/lib/desktop/tauri-bridge";

export const ADMIN_ZOOM_STORAGE_KEY = "subidha:admin-desktop-zoom:v1";
export const DEFAULT_ADMIN_ZOOM = "0.8"; // 80% default ERP scale fits perfectly on 1366x768 & laptop screens
export const ADMIN_ZOOM_EVENT = "subidha:admin-zoom-change";

export const ADMIN_ZOOM_OPTIONS = [
  { value: "0.7", label: "70% (Ultra Compact)" },
  { value: "0.75", label: "75% (Small Laptop)" },
  { value: "0.8", label: "80% (Desktop ERP — Recommended)" },
  { value: "0.85", label: "85% (Balanced Compact)" },
  { value: "0.9", label: "90% (Comfortable)" },
  { value: "0.95", label: "95% (Near Standard)" },
  { value: "1.0", label: "100% (Standard)" },
  { value: "1.1", label: "110% (Large)" },
  { value: "1.25", label: "125% (Extra Large)" },
] as const;

export type AdminZoomValue = (typeof ADMIN_ZOOM_OPTIONS)[number]["value"];

export function getStoredAdminZoom(): string {
  if (typeof window === "undefined") return DEFAULT_ADMIN_ZOOM;
  try {
    const stored = window.localStorage.getItem(ADMIN_ZOOM_STORAGE_KEY);
    if (stored) {
      const num = parseFloat(stored);
      if (!isNaN(num) && num >= 0.5 && num <= 2.0) {
        return stored;
      }
    }
  } catch {
    // ignore local storage errors
  }
  return DEFAULT_ADMIN_ZOOM;
}

export function setStoredAdminZoom(value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ADMIN_ZOOM_STORAGE_KEY, value);
  } catch {
    // ignore local storage errors
  }
  applyAdminDesktopScale(true, value);
  window.dispatchEvent(new CustomEvent(ADMIN_ZOOM_EVENT, { detail: value }));
}

export function zoomIn(): void {
  const current = parseFloat(getStoredAdminZoom());
  const steps = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 1.25];
  const next = steps.find((val) => val > current + 0.01) ?? Math.min(current + 0.05, 1.5);
  setStoredAdminZoom(next.toFixed(2).replace(/\.00$/, "").replace(/(\.[0-9])0$/, "$1"));
}

export function zoomOut(): void {
  const current = parseFloat(getStoredAdminZoom());
  const steps = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 1.25];
  const prev = [...steps].reverse().find((val) => val < current - 0.01) ?? Math.max(current - 0.05, 0.6);
  setStoredAdminZoom(prev.toFixed(2).replace(/\.00$/, "").replace(/(\.[0-9])0$/, "$1"));
}

export function resetZoom(): void {
  setStoredAdminZoom(DEFAULT_ADMIN_ZOOM);
}

export function applyAdminDesktopScale(active: boolean, zoomValue?: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const zoom = zoomValue || getStoredAdminZoom();
  const numZoom = parseFloat(zoom) || 0.8;

  if (active) {
    root.classList.add("admin-desktop-view");
    root.style.setProperty("--admin-desktop-zoom", zoom);

    if (isTauriDesktop()) {
      // Hardware-accelerated GPU zoom via Tauri native Webview Window API.
      // Avoids WebKit CPU layout thrashing, repaint stutter, and lag.
      setNativeDesktopZoom(numZoom).catch(() => {});
      try {
        (root.style as unknown as Record<string, string>).zoom = "";
      } catch {
        // fallback
      }
    } else {
      // Standard browser fallback
      try {
        (root.style as unknown as Record<string, string>).zoom = zoom;
      } catch {
        // fallback
      }
    }
  } else {
    root.classList.remove("admin-desktop-view");
    root.style.removeProperty("--admin-desktop-zoom");
    if (isTauriDesktop()) {
      setNativeDesktopZoom(1.0).catch(() => {});
    }
    try {
      (root.style as unknown as Record<string, string>).zoom = "";
    } catch {
      // fallback
    }
  }
}

function subscribeAdminZoom(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(ADMIN_ZOOM_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(ADMIN_ZOOM_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getAdminZoomSnapshot(): string {
  return getStoredAdminZoom();
}

function getAdminZoomServerSnapshot(): string {
  return DEFAULT_ADMIN_ZOOM;
}

export function useAdminDesktopZoom() {
  const zoom = useSyncExternalStore(
    subscribeAdminZoom,
    getAdminZoomSnapshot,
    getAdminZoomServerSnapshot
  );

  const changeZoom = (newZoom: string) => {
    setStoredAdminZoom(newZoom);
  };

  return {
    zoom,
    changeZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    options: ADMIN_ZOOM_OPTIONS,
  };
}
