"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type DockWindowState = "minimized" | "normal" | "maximized";

export type DockWindowPosition = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DockWindow = {
  id: string;
  title: string;
  route: string;
  state: DockWindowState;
  zIndex: number;
  position: DockWindowPosition;
  createdAt: number;
  lastActiveAt: number;
  icon?: string;
};

export type AdminWorkspaceDockContextType = {
  windows: DockWindow[];
  activeWindowId: string | null;
  openInDock: (route: string, title?: string, icon?: string) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeAll: () => void;
  restoreAll: () => void;
  closeAll: () => void;
  tileWindows: (layout?: "horizontal" | "vertical") => void;
  updateWindowRoute: (id: string, newRoute: string, newTitle?: string) => void;
  updateWindowPosition: (id: string, position: Partial<DockWindowPosition>) => void;
  isDraggingOrResizing: boolean;
  setDraggingOrResizing: (active: boolean) => void;
  isDockCollapsed: boolean;
  setIsDockCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  isDockSupported: boolean;
  lastClosedWindow: { route: string; title: string; icon?: string } | null;
  reopenLastClosed: () => void;
};

const MAX_DOCK_WINDOWS = 8;
const STORAGE_KEY = "subidha:admin:workspace-dock:v1";

export function sanitizeAdminRoute(input: string): string | null {
  if (!input) return null;
  let trimmed = input.trim();

  // Block dangerous schemes
  if (
    trimmed.startsWith("//") ||
    trimmed.toLowerCase().startsWith("javascript:") ||
    trimmed.toLowerCase().startsWith("data:") ||
    trimmed.toLowerCase().startsWith("vbscript:")
  ) {
    return null;
  }

  // Handle absolute URL if it is same-origin
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      if (typeof window !== "undefined" && url.origin !== window.location.origin) {
        return null; // External origin rejected
      }
      trimmed = url.pathname + url.search;
    } catch {
      return null;
    }
  }

  // Ensure leading slash
  if (!trimmed.startsWith("/")) {
    trimmed = `/${trimmed}`;
  }

  // If user typed e.g. "/customers" or "/finance/collect", auto-prefix with "/admin"
  if (!trimmed.startsWith("/admin/") && trimmed !== "/admin") {
    trimmed = `/admin${trimmed}`;
  }

  return trimmed;
}

const AdminWorkspaceDockContext = createContext<AdminWorkspaceDockContextType | null>(null);

function routeToDefaultTitle(route: string): string {
  const clean = route.split("?")[0].replace(/^\/+|\/+$/g, "");
  const segments = clean.split("/").filter(Boolean);
  if (segments.length <= 1) return "Admin Dashboard";

  const sub = segments.slice(1).join("/");
  if (sub === "customers") return "Customers";
  if (sub === "customers/create") return "New Customer";
  if (sub.startsWith("customers/")) return "Customer Details";
  if (sub === "subscriptions/advance-emi/create" || sub === "subscriptions/create") return "New SFEMI Contract";
  if (sub === "subscriptions") return "SFEMI Subscriptions";
  if (sub.startsWith("subscriptions/")) return "Subscription Details";
  if (sub === "finance/collect" || sub === "collect") return "Collect Payment";
  if (sub === "billing/direct-sale/create") return "New Direct Sale";
  if (sub === "inventory" || sub === "inventory/stock-needs") return "Stock Needs & Inventory";
  if (sub === "accounting") return "Day Close & Accounting";
  if (sub === "delivery" || sub === "delivery/create") return "Deliveries";
  if (sub === "pim/products" || sub === "products") return "Product Catalog (PIM)";
  if (sub === "crm") return "CRM Workbench";
  if (sub === "cashier") return "Cashier Counter";

  const last = segments[segments.length - 1];
  return last
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function routeToDefaultIcon(route: string): string {
  const clean = route.toLowerCase();
  if (clean.includes("customer")) return "users";
  if (clean.includes("subscription") || clean.includes("contract")) return "clipboard";
  if (clean.includes("collect") || clean.includes("payment") || clean.includes("finance")) return "credit-card";
  if (clean.includes("direct-sale") || clean.includes("billing")) return "receipt";
  if (clean.includes("inventory") || clean.includes("stock") || clean.includes("product")) return "boxes";
  if (clean.includes("accounting") || clean.includes("ledger") || clean.includes("reconciliation")) return "landmark";
  if (clean.includes("delivery")) return "truck";
  if (clean.includes("crm")) return "handshake";
  return "layout";
}

function calculateDefaultPosition(index: number): DockWindowPosition {
  if (typeof window === "undefined") {
    return { x: 80, y: 80, width: 980, height: 640 };
  }
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  const width = Math.min(1060, Math.max(480, Math.floor(screenW * 0.78)));
  const height = Math.min(760, Math.max(420, Math.floor(screenH * 0.76)));

  const stagger = (index % 6) * 28;
  const x = Math.max(40, Math.min(screenW - width - 40, 60 + stagger));
  const y = Math.max(60, Math.min(screenH - height - 80, 70 + stagger));

  return { x, y, width, height };
}

function loadInitialSession(): { windows: DockWindow[]; activeWindowId: string | null } {
  if (typeof window === "undefined") {
    return { windows: [], activeWindowId: null };
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        windows: DockWindow[];
        activeWindowId: string | null;
      };
      if (Array.isArray(parsed.windows) && parsed.windows.length > 0) {
        const valid = parsed.windows.slice(0, MAX_DOCK_WINDOWS).map((w, idx) => ({
          ...w,
          state: "minimized" as DockWindowState,
          zIndex: 100 + idx,
        }));
        return { windows: valid, activeWindowId: null };
      }
    }
  } catch {
    // safe fallback
  }
  return { windows: [], activeWindowId: null };
}

export function AdminWorkspaceDockProvider({
  children,
  isDockSupported = true,
}: {
  children: ReactNode;
  isDockSupported?: boolean;
}) {
  const [initialSession] = useState(loadInitialSession);
  const [windows, setWindows] = useState<DockWindow[]>(initialSession.windows);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(initialSession.activeWindowId);
  const [isDraggingOrResizing, setDraggingOrResizing] = useState(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [lastClosedWindow, setLastClosedWindow] = useState<{
    route: string;
    title: string;
    icon?: string;
  } | null>(null);
  const maxZRef = useRef(100 + initialSession.windows.length);

  // Clean up on session logout
  useEffect(() => {
    function handleSessionChange() {
      try {
        const session = window.sessionStorage.getItem("subidha:session");
        const local = window.localStorage.getItem("subidha_auth_tokens");
        if (!session && !local) {
          setWindows([]);
          setActiveWindowId(null);
          window.sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // safe fallback
      }
    }

    window.addEventListener("subidha:session", handleSessionChange);
    window.addEventListener("storage", handleSessionChange);
    return () => {
      window.removeEventListener("subidha:session", handleSessionChange);
      window.removeEventListener("storage", handleSessionChange);
    };
  }, []);

  // Save session state to sessionStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (windows.length === 0) {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } else {
        const serializable = windows.map((w) => ({
          id: w.id,
          title: w.title,
          route: w.route,
          state: w.state,
          position: w.position,
          icon: w.icon,
          createdAt: w.createdAt,
          lastActiveAt: w.lastActiveAt,
          zIndex: w.zIndex,
        }));
        window.sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ windows: serializable, activeWindowId })
        );
      }
    } catch {
      // non-critical persistence
    }
  }, [windows, activeWindowId]);

  const focusWindow = useCallback((id: string) => {
    maxZRef.current += 1;
    const nextZ = maxZRef.current;
    setActiveWindowId(id);
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, zIndex: nextZ, lastActiveAt: Date.now() } : w))
    );
  }, []);

  const openInDock = useCallback(
    (route: string, customTitle?: string, icon?: string) => {
      const cleanRoute = sanitizeAdminRoute(route);
      if (!cleanRoute) return;

      const title = customTitle?.trim() || routeToDefaultTitle(cleanRoute);
      const windowIcon = icon || routeToDefaultIcon(cleanRoute);

      setWindows((prev) => {
        // If window with this route already exists, activate & restore it
        const existing = prev.find((w) => w.route === cleanRoute);
        if (existing) {
          maxZRef.current += 1;
          const nextZ = maxZRef.current;
          setActiveWindowId(existing.id);
          return prev.map((w) =>
            w.id === existing.id
              ? {
                  ...w,
                  state: w.state === "minimized" ? "normal" : w.state,
                  zIndex: nextZ,
                  lastActiveAt: Date.now(),
                }
              : w
          );
        }

        // Enforce max window limit: if at capacity, recycle the oldest inactive window
        let baseList = prev;
        if (baseList.length >= MAX_DOCK_WINDOWS) {
          const sorted = [...baseList].sort((a, b) => a.lastActiveAt - b.lastActiveAt);
          const oldest = sorted[0];
          baseList = baseList.filter((w) => w.id !== oldest.id);
        }

        maxZRef.current += 1;
        const nextZ = maxZRef.current;
        const newId = `win-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const pos = calculateDefaultPosition(baseList.length);

        const newWindow: DockWindow = {
          id: newId,
          title,
          route: cleanRoute,
          state: "normal",
          zIndex: nextZ,
          position: pos,
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          icon: windowIcon,
        };

        setActiveWindowId(newId);
        return [...baseList, newWindow];
      });
    },
    []
  );

  const closeWindow = useCallback((id: string) => {
    setWindows((prev) => {
      const target = prev.find((w) => w.id === id);
      if (target) {
        setLastClosedWindow({
          route: target.route,
          title: target.title,
          icon: target.icon,
        });
      }
      const nextList = prev.filter((w) => w.id !== id);
      return nextList;
    });
    setActiveWindowId((prevActive) => (prevActive === id ? null : prevActive));
  }, []);

  const reopenLastClosed = useCallback(() => {
    if (!lastClosedWindow) return;
    openInDock(lastClosedWindow.route, lastClosedWindow.title, lastClosedWindow.icon);
    setLastClosedWindow(null);
  }, [lastClosedWindow, openInDock]);

  const minimizeWindow = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, state: "minimized" } : w))
    );
    setActiveWindowId((current) => {
      if (current === id) return null;
      return current;
    });
  }, []);

  const maximizeWindow = useCallback(
    (id: string) => {
      focusWindow(id);
      setWindows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, state: "maximized" } : w))
      );
    },
    [focusWindow]
  );

  const restoreWindow = useCallback(
    (id: string) => {
      focusWindow(id);
      setWindows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, state: "normal" } : w))
      );
    },
    [focusWindow]
  );

  const minimizeAll = useCallback(() => {
    setWindows((prev) => prev.map((w) => ({ ...w, state: "minimized" })));
    setActiveWindowId(null);
  }, []);

  const restoreAll = useCallback(() => {
    maxZRef.current += 1;
    const nextZ = maxZRef.current;
    setWindows((prev) =>
      prev.map((w, idx) => ({
        ...w,
        state: "normal",
        zIndex: nextZ + idx,
      }))
    );
    maxZRef.current += prevWindowsCount();
    function prevWindowsCount() {
      return windows.length;
    }
  }, [windows.length]);

  const closeAll = useCallback(() => {
    setWindows([]);
    setActiveWindowId(null);
  }, []);

  const tileWindows = useCallback(
    (layout: "horizontal" | "vertical" = "horizontal") => {
      if (typeof window === "undefined") return;
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;

      // Filter active non-minimized windows
      setWindows((prev) => {
        const visible = prev.filter((w) => w.state !== "minimized");
        if (visible.length === 0) return prev;

        const count = Math.min(visible.length, 4);
        const topOffset = 64;
        const bottomOffset = 50;
        const availH = screenH - topOffset - bottomOffset;

        return prev.map((w) => {
          const visibleIdx = visible.findIndex((v) => v.id === w.id);
          if (visibleIdx === -1 || visibleIdx >= count) return w;

          let newPos: DockWindowPosition;
          if (layout === "horizontal") {
            const colWidth = Math.floor(screenW / count);
            newPos = {
              x: visibleIdx * colWidth,
              y: topOffset,
              width: colWidth,
              height: availH,
            };
          } else {
            const rowHeight = Math.floor(availH / count);
            newPos = {
              x: 0,
              y: topOffset + visibleIdx * rowHeight,
              width: screenW,
              height: rowHeight,
            };
          }

          return {
            ...w,
            state: "normal",
            position: newPos,
          };
        });
      });
    },
    []
  );

  const updateWindowRoute = useCallback(
    (id: string, newRoute: string, newTitle?: string) => {
      setWindows((prev) =>
        prev.map((w) =>
          w.id === id
            ? {
                ...w,
                route: newRoute,
                title: newTitle || routeToDefaultTitle(newRoute),
              }
            : w
        )
      );
    },
    []
  );

  const updateWindowPosition = useCallback(
    (id: string, partial: Partial<DockWindowPosition>) => {
      setWindows((prev) =>
        prev.map((w) =>
          w.id === id
            ? {
                ...w,
                position: { ...w.position, ...partial },
              }
            : w
        )
      );
    },
    []
  );

  const value = useMemo<AdminWorkspaceDockContextType>(
    () => ({
      windows,
      activeWindowId,
      openInDock,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow,
      focusWindow,
      minimizeAll,
      restoreAll,
      closeAll,
      tileWindows,
      updateWindowRoute,
      updateWindowPosition,
      isDraggingOrResizing,
      setDraggingOrResizing,
      isDockCollapsed,
      setIsDockCollapsed,
      isDockSupported,
      lastClosedWindow,
      reopenLastClosed,
    }),
    [
      windows,
      activeWindowId,
      openInDock,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow,
      focusWindow,
      minimizeAll,
      restoreAll,
      closeAll,
      tileWindows,
      updateWindowRoute,
      updateWindowPosition,
      isDraggingOrResizing,
      setDraggingOrResizing,
      isDockCollapsed,
      isDockSupported,
      lastClosedWindow,
      reopenLastClosed,
    ]
  );

  return (
    <AdminWorkspaceDockContext.Provider value={value}>
      {children}
    </AdminWorkspaceDockContext.Provider>
  );
}

export function useAdminWorkspaceDock() {
  const context = useContext(AdminWorkspaceDockContext);
  if (!context) {
    return {
      windows: [],
      activeWindowId: null,
      openInDock: () => undefined,
      closeWindow: () => undefined,
      minimizeWindow: () => undefined,
      maximizeWindow: () => undefined,
      restoreWindow: () => undefined,
      focusWindow: () => undefined,
      minimizeAll: () => undefined,
      restoreAll: () => undefined,
      closeAll: () => undefined,
      tileWindows: () => undefined,
      updateWindowRoute: () => undefined,
      updateWindowPosition: () => undefined,
      isDraggingOrResizing: false,
      setDraggingOrResizing: () => undefined,
      isDockCollapsed: false,
      setIsDockCollapsed: () => undefined,
      isDockSupported: false,
      lastClosedWindow: null,
      reopenLastClosed: () => undefined,
    };
  }
  return context;
}
