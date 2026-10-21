// frontend/src/lib/admin-desktop-zoom.ts
"use client";

import { useSyncExternalStore } from "react";

export const ADMIN_ZOOM_STORAGE_KEY = "subidha:admin-desktop-zoom:v1";
export const DEFAULT_ADMIN_ZOOM = "0.8";
export const ADMIN_ZOOM_EVENT = "subidha:admin-zoom-change";

export const ADMIN_ZOOM_OPTIONS = [
  { value: "0.8", label: "80% (Desktop ERP — Recommended)" },
  { value: "0.85", label: "85% (Compact)" },
  { value: "0.9", label: "90% (Balanced)" },
  { value: "1.0", label: "100% (Standard)" },
] as const;

export type AdminZoomValue = (typeof ADMIN_ZOOM_OPTIONS)[number]["value"];

export function getStoredAdminZoom(): string {
  if (typeof window === "undefined") return DEFAULT_ADMIN_ZOOM;
  try {
    const stored = window.localStorage.getItem(ADMIN_ZOOM_STORAGE_KEY);
    if (stored && ADMIN_ZOOM_OPTIONS.some((opt) => opt.value === stored)) {
      return stored;
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

export function applyAdminDesktopScale(active: boolean, zoom = getStoredAdminZoom()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (active) {
    root.classList.add("admin-desktop-view");
    root.style.setProperty("--admin-desktop-zoom", zoom);
  } else {
    root.classList.remove("admin-desktop-view");
    root.style.removeProperty("--admin-desktop-zoom");
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
    options: ADMIN_ZOOM_OPTIONS,
  };
}
