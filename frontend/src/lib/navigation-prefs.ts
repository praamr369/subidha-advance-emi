// frontend/src/lib/navigation-prefs.ts
"use client";

import type { NavGroup } from "@/config/navigation";

export type CustomNavLayout = {
  moduleOrder?: string[];
  pageOrders?: Record<string, string[]>;
  hiddenHrefs?: string[];
  customGroupNames?: Record<string, string>;
};

const NAV_LAYOUT_KEY = "subidha:admin:nav_layout:v1";
const listeners = new Set<() => void>();

// Stable snapshot cache. useSyncExternalStore compares snapshots with Object.is,
// so we must return the SAME reference until the underlying value actually changes.
const EMPTY_LAYOUT: CustomNavLayout = Object.freeze({});
let cachedRaw: string | null = null;
let cachedLayout: CustomNavLayout = EMPTY_LAYOUT;

function emitChange() {
  // Invalidate cache so the next read re-parses localStorage.
  cachedRaw = null;
  listeners.forEach((listener) => listener());
}

export function subscribeNavLayout(listener: () => void) {
  listeners.add(listener);
  if (typeof window !== "undefined") {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === NAV_LAYOUT_KEY) {
        listener();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", handleStorage);
    };
  }
  return () => {
    listeners.delete(listener);
  };
}

export function readNavLayout(): CustomNavLayout {
  if (typeof window === "undefined") return EMPTY_LAYOUT;
  try {
    const raw = window.localStorage.getItem(NAV_LAYOUT_KEY);
    if (!raw) {
      cachedRaw = null;
      cachedLayout = EMPTY_LAYOUT;
      return cachedLayout;
    }
    // Return the cached parse unless the stored string changed.
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedLayout = JSON.parse(raw) as CustomNavLayout;
    }
    return cachedLayout;
  } catch {
    cachedRaw = null;
    cachedLayout = EMPTY_LAYOUT;
    return cachedLayout;
  }
}

// Server snapshot: always the same frozen empty reference (no localStorage on server).
export function readNavLayoutServer(): CustomNavLayout {
  return EMPTY_LAYOUT;
}

export function writeNavLayout(layout: CustomNavLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAV_LAYOUT_KEY, JSON.stringify(layout));
    emitChange();
  } catch {
    // Ignore storage errors in sandbox/quota-exceeded
  }
}

export function resetNavLayout(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NAV_LAYOUT_KEY);
    emitChange();
  } catch {}
}

type ProcessedNavGroup = NavGroup & { originalTitle?: string };

/**
 * Applies user-customized module order, page order, display names, and visibility
 * to canonical navigation groups.
 */
export function applyNavLayoutToGroups(
  groups: NavGroup[],
  layout: CustomNavLayout,
  options?: { showHidden?: boolean }
): NavGroup[] {
  if (!layout || Object.keys(layout).length === 0) {
    return groups;
  }

  const hiddenSet = new Set(layout.hiddenHrefs ?? []);
  const moduleOrderMap = new Map((layout.moduleOrder ?? []).map((title, idx) => [title, idx]));
  const customNames = layout.customGroupNames ?? {};

  const processed: ProcessedNavGroup[] = groups.map((group) => {
    const pageOrderMap = new Map((layout.pageOrders?.[group.title] ?? []).map((href, idx) => [href, idx]));

    // Filter and sort items inside group
    const items = group.items
      .filter((item) => options?.showHidden || !hiddenSet.has(item.href))
      .map((item) => {
        if (!item.children) return item;
        const subItems = item.children.filter((child) => options?.showHidden || !hiddenSet.has(child.href));
        return { ...item, children: subItems };
      })
      .sort((a, b) => {
        const idxA = pageOrderMap.get(a.href) ?? 9999;
        const idxB = pageOrderMap.get(b.href) ?? 9999;
        if (idxA !== idxB) return idxA - idxB;
        return 0;
      });

    return {
      ...group,
      title: customNames[group.title] || group.title,
      originalTitle: group.title,
      items,
    };
  });

  // Sort parent groups
  processed.sort((a, b) => {
    const titleA = a.originalTitle || a.title;
    const titleB = b.originalTitle || b.title;
    const idxA = moduleOrderMap.get(titleA) ?? 9999;
    const idxB = moduleOrderMap.get(titleB) ?? 9999;
    if (idxA !== idxB) return idxA - idxB;
    return 0;
  });

  return options?.showHidden ? processed : processed.filter((g) => g.items.length > 0);
}
