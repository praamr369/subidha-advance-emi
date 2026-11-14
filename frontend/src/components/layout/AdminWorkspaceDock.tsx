"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Boxes,
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Columns2,
  CreditCard,
  ExternalLink,
  Factory,
  Handshake,
  Landmark,
  LayoutGrid,
  Link2,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  ReceiptText,
  RotateCw,
  Search,
  Settings,
  Sparkles,
  Truck,
  Undo2,
  Users,
  X,
} from "lucide-react";

import {
  useAdminWorkspaceDock,
  sanitizeAdminRoute,
  routeToDefaultIcon,
  type DockWindow,
  type DockWindowPosition,
} from "./AdminWorkspaceDockContext";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import { ADMIN_ROUTE_REGISTRY, type AdminRouteRegistryItem } from "@/config/admin-route-registry";

const QUICK_DOCK_PRESETS = [
  { label: "Customers", route: ROUTES.admin.customers, icon: "users", description: "Customer ledger, accounts, verification and status." },
  { label: "New SFEMI Contract", route: ROUTES.admin.subscriptionsAdvanceEmiCreate, icon: "clipboard", description: "New subscription, plan selection, schedule preview." },
  { label: "Collect Payment", route: ROUTES.admin.financeCollect, icon: "credit-card", description: "Collect and allocate EMI, direct sales, advance and fines." },
  { label: "Direct Sale (Billing)", route: ROUTES.admin.billingDirectSaleCreate, icon: "receipt", description: "Direct retail sales POS and billing invoice creation." },
  { label: "Inventory & Stock Needs", route: "/admin/inventory/stock-needs", icon: "boxes", description: "Real-time stock requirement, replenishment and shortages." },
  { label: "Day Close & Accounting", route: ROUTES.admin.accounting, icon: "landmark", description: "Daily closing, drawer reconciliation and ledger audits." },
  { label: "Deliveries", route: ROUTES.admin.delivery, icon: "truck", description: "Delivery dispatches, challans, and customer drop-offs." },
  { label: "CRM Workbench", route: ROUTES.admin.crm, icon: "handshake", description: "Leads, customer requests, pipeline and service tickets." },
];

const MODULE_CATEGORIES = [
  "All",
  "★ Quick Presets",
  "Command Center",
  "Collections & Cashier",
  "Finance Operations",
  "Accounting & Reconciliation",
  "Sales & Contracts",
  "SFEMI Control",
  "CRM & Customers",
  "Inventory & Stock",
  "Purchases & Vendors",
  "Delivery & Service",
  "HR & Staff",
  "Manufacturing",
  "BI & Reports",
  "Settings & Governance",
] as const;

type ModuleCategory = (typeof MODULE_CATEGORIES)[number];

function getWindowIcon(iconKey?: string) {
  switch (iconKey) {
    case "users":
      return Users;
    case "clipboard":
      return ClipboardList;
    case "credit-card":
      return CreditCard;
    case "receipt":
      return ReceiptText;
    case "boxes":
      return Boxes;
    case "landmark":
      return Landmark;
    case "truck":
      return Truck;
    case "handshake":
      return Handshake;
    case "building":
      return Building2;
    case "factory":
      return Factory;
    case "briefcase":
      return Briefcase;
    case "chart":
      return BarChart3;
    case "sparkles":
      return Sparkles;
    case "settings":
      return Settings;
    case "dashboard":
    case "layout":
    default:
      return LayoutGrid;
  }
}

function getGroupIcon(group?: string) {
  switch (group) {
    case "Command Center":
      return LayoutGrid;
    case "CRM & Customers":
    case "Profiles & Parties":
      return Users;
    case "Sales & Contracts":
      return ReceiptText;
    case "SFEMI Control":
      return ClipboardList;
    case "Collections & Cashier":
      return CreditCard;
    case "Finance Operations":
    case "Accounting & Reconciliation":
      return Landmark;
    case "Inventory & Stock":
      return Boxes;
    case "Purchases & Vendors":
      return Building2;
    case "Manufacturing":
      return Factory;
    case "Delivery & Service":
      return Truck;
    case "HR & Staff":
      return Briefcase;
    case "BI & Reports":
      return BarChart3;
    case "Growth & Offers":
      return Sparkles;
    case "Enterprise Control":
    case "Settings & Governance":
      return Settings;
    default:
      return LayoutGrid;
  }
}

export default function AdminWorkspaceDock() {
  const {
    windows,
    activeWindowId,
    openInDock,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    focusWindow,
    minimizeAll,
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
  } = useAdminWorkspaceDock();

  const [menuOpen, setMenuOpen] = useState(false);
  const [routeSearch, setRouteSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ModuleCategory>("All");
  const [customRouteInput, setCustomRouteInput] = useState("");
  const [copiedWindowId, setCopiedWindowId] = useState<string | null>(null);
  const [frameLoading, setFrameLoading] = useState<Record<string, boolean>>({});
  const [customRouteError, setCustomRouteError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Dragging & Resizing state
  const dragRef = useRef<{
    windowId: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
    isResize: boolean;
  } | null>(null);

  // Stop drag/resize on mouse up or mouse leave
  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      setDraggingOrResizing(false);
    }
  }, [setDraggingOrResizing]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { windowId, startX, startY, initialX, initialY, initialW, initialH, isResize } =
        dragRef.current;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      if (isResize) {
        const nextW = Math.max(380, Math.min(window.innerWidth - initialX - 20, initialW + deltaX));
        const nextH = Math.max(260, Math.min(window.innerHeight - initialY - 50, initialH + deltaY));
        updateWindowPosition(windowId, { width: nextW, height: nextH });
      } else {
        const maxX = Math.max(0, window.innerWidth - initialW);
        const maxY = Math.max(50, window.innerHeight - 80);
        const nextX = Math.max(0, Math.min(maxX, initialX + deltaX));
        const nextY = Math.max(50, Math.min(maxY, initialY + deltaY));
        updateWindowPosition(windowId, { x: nextX, y: nextY });
      }
    },
    [updateWindowPosition]
  );

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Viewport resize auto-clamping edge case
  useEffect(() => {
    function handleWindowResize() {
      if (typeof window === "undefined") return;
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;

      windows.forEach((w) => {
        if (w.state === "normal") {
          const maxWidth = Math.max(380, screenW - 20);
          const maxHeight = Math.max(260, screenH - 100);

          const newW = Math.min(w.position.width, maxWidth);
          const newH = Math.min(w.position.height, maxHeight);
          const newX = Math.max(0, Math.min(screenW - newW, w.position.x));
          const newY = Math.max(50, Math.min(screenH - newH - 40, w.position.y));

          if (
            newW !== w.position.width ||
            newH !== w.position.height ||
            newX !== w.position.x ||
            newY !== w.position.y
          ) {
            updateWindowPosition(w.id, { x: newX, y: newY, width: newW, height: newH });
          }
        }
      });
    }

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [windows, updateWindowPosition]);

  // Dark/Light theme sync into embedded iframes edge case
  useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      windows.forEach((w) => {
        const iframe = document.getElementById(`iframe-${w.id}`) as HTMLIFrameElement | null;
        try {
          if (iframe?.contentDocument?.documentElement) {
            iframe.contentDocument.documentElement.classList.toggle("dark", isDark);
          }
        } catch {
          // safe fallback
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [windows]);

  // Global Keyboard shortcuts for PC desktop feel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isDockSupported) return;
      // Alt + W: Toggle Workspace Dock Menu
      if (e.altKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        setMenuOpen((prev) => !prev);
      }
      // Alt + D: Show Dashboard (minimize all)
      if (e.altKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        minimizeAll();
      }
      // Alt + M: Minimize active window
      if (e.altKey && e.key.toLowerCase() === "m" && activeWindowId) {
        e.preventDefault();
        minimizeWindow(activeWindowId);
      }
      // Alt + Shift + X: Close active window
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "x" && activeWindowId) {
        e.preventDefault();
        closeWindow(activeWindowId);
      }
      // Escape: Restore or Minimize active window
      if (e.key === "Escape" && activeWindowId) {
        const activeWin = windows.find((w) => w.id === activeWindowId);
        if (activeWin?.state === "maximized") {
          e.preventDefault();
          restoreWindow(activeWindowId);
        } else if (activeWin?.state === "normal") {
          e.preventDefault();
          minimizeWindow(activeWindowId);
        }
      }
      // Alt + 1..8: Switch directly to window index
      if (e.altKey && !e.shiftKey && !e.ctrlKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= windows.length) {
          e.preventDefault();
          const target = windows[num - 1];
          if (target) {
            restoreWindow(target.id);
          }
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isDockSupported,
    activeWindowId,
    windows,
    minimizeAll,
    minimizeWindow,
    closeWindow,
    restoreWindow,
  ]);

  // Auto-focus search input when menu opens
  useEffect(() => {
    if (!menuOpen) return;
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [menuOpen]);

  // Deduplicate all registered admin routes (covers 348 concrete pages)
  const uniqueRegistryItems = useMemo(() => {
    const seen = new Set<string>();
    const items: AdminRouteRegistryItem[] = [];
    for (const it of ADMIN_ROUTE_REGISTRY) {
      if (!it.href || seen.has(it.href)) continue;
      seen.add(it.href);
      items.push(it);
    }
    return items;
  }, []);

  // Filter routes by category pill and search query
  const filteredRoutes = useMemo(() => {
    const q = routeSearch.trim().toLowerCase();

    return uniqueRegistryItems.filter((item) => {
      // 1. Module category filter
      if (selectedCategory !== "All" && selectedCategory !== "★ Quick Presets") {
        if (item.group !== selectedCategory) {
          if (selectedCategory === "CRM & Customers" && item.group === "Profiles & Parties") {
            // merge into CRM
          } else if (
            selectedCategory === "Settings & Governance" &&
            item.group === "Enterprise Control"
          ) {
            // merge into Settings
          } else {
            return false;
          }
        }
      }

      // 2. Search query matching across label, href, group, and description
      if (!q) return true;

      return (
        item.label.toLowerCase().includes(q) ||
        item.href.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    });
  }, [uniqueRegistryItems, routeSearch, selectedCategory]);

  const filteredPresets = useMemo(() => {
    const q = routeSearch.trim().toLowerCase();
    if (!q) return QUICK_DOCK_PRESETS;
    return QUICK_DOCK_PRESETS.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.route.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }, [routeSearch]);

  const handleSearchSubmit = () => {
    const q = routeSearch.trim();
    if (!q) return;

    if (selectedCategory === "★ Quick Presets" && !q) {
      if (filteredPresets.length > 0) {
        const topPreset = filteredPresets[0];
        openInDock(topPreset.route, topPreset.label, topPreset.icon);
        setMenuOpen(false);
        setRouteSearch("");
      }
      return;
    }

    if (filteredRoutes.length > 0) {
      const topMatch = filteredRoutes[0];
      openInDock(topMatch.href, topMatch.label, routeToDefaultIcon(topMatch.href));
      setMenuOpen(false);
      setRouteSearch("");
      return;
    }

    // Try custom route input if user typed a direct URL
    const sanitized = sanitizeAdminRoute(q);
    if (sanitized) {
      openInDock(sanitized);
      setMenuOpen(false);
      setRouteSearch("");
    }
  };

  const startDrag = (
    e: ReactMouseEvent,
    windowId: string,
    currentPos: DockWindowPosition,
    isResize = false
  ) => {
    if (e.button !== 0) return; // primary mouse button only
    e.preventDefault();
    focusWindow(windowId);
    setDraggingOrResizing(true);
    dragRef.current = {
      windowId,
      startX: e.clientX,
      startY: e.clientY,
      initialX: currentPos.x,
      initialY: currentPos.y,
      initialW: currentPos.width,
      initialH: currentPos.height,
      isResize,
    };
  };

  const handleCopyLink = (w: DockWindow) => {
    const full = `${window.location.origin}${w.route}`;
    void navigator.clipboard.writeText(full).then(() => {
      setCopiedWindowId(w.id);
      setTimeout(() => setCopiedWindowId(null), 2000);
    });
  };

  const handleLaunchCustomRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customRouteInput.trim()) return;
    const sanitized = sanitizeAdminRoute(customRouteInput.trim());
    if (!sanitized) {
      setCustomRouteError("Please enter a valid internal admin route (e.g. /admin/customers)");
      return;
    }
    setCustomRouteError(null);
    openInDock(sanitized);
    setCustomRouteInput("");
    setMenuOpen(false);
  };

  if (!isDockSupported) {
    return null;
  }

  return (
    <>
      {/* 1. RENDER ALL OPEN DOCKED WINDOWS */}
      {windows.map((w) => {
        const isMinimized = w.state === "minimized";
        const isMaximized = w.state === "maximized";
        const isActive = activeWindowId === w.id;
        const IconComponent = getWindowIcon(w.icon);

        // Build docked URL query
        const hasQuery = w.route.includes("?");
        const iframeSrc = `${w.route}${hasQuery ? "&" : "?"}workspace_docked=1`;

        return (
          <div
            key={w.id}
            id={`dock-win-${w.id}`}
            aria-hidden={isMinimized}
            onClick={() => {
              if (!isActive) focusWindow(w.id);
            }}
            className={cn(
              "transition-opacity duration-150 flex flex-col bg-background/95 backdrop-blur-md border border-[var(--topbar-border)] shadow-2xl overflow-hidden",
              isMinimized && "hidden pointer-events-none",
              isMaximized
                ? "fixed inset-x-0 top-[52px] bottom-10 z-[120] rounded-none border-x-0"
                : "fixed rounded-xl"
            )}
            style={{
              zIndex: w.zIndex,
              ...(!isMaximized && !isMinimized
                ? {
                    left: `${w.position.x}px`,
                    top: `${w.position.y}px`,
                    width: `${w.position.width}px`,
                    height: `${w.position.height}px`,
                  }
                : {}),
            }}
          >
            {/* Titlebar */}
            <div
              onMouseDown={(e) => {
                if (!isMaximized) {
                  startDrag(e, w.id, w.position, false);
                }
              }}
              onDoubleClick={() => {
                if (isMaximized) {
                  restoreWindow(w.id);
                } else {
                  maximizeWindow(w.id);
                }
              }}
              className={cn(
                "h-10 select-none flex items-center justify-between px-3 border-b border-[var(--topbar-border)] cursor-grab active:cursor-grabbing",
                isActive
                  ? "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--topbar-control)_95%,white_5%),color-mix(in_oklab,var(--topbar-control)_80%,var(--surface-muted)_20%))] text-foreground font-medium"
                  : "bg-muted/40 text-muted-foreground"
              )}
            >
              {/* Window Identity */}
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-md border text-xs shrink-0",
                    isActive
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/60 bg-muted/60 text-muted-foreground"
                  )}
                >
                  <IconComponent className="size-3.5" />
                </span>
                <span className="truncate text-xs font-semibold max-w-[200px] sm:max-w-[320px]">
                  {w.title}
                </span>
                <span className="hidden sm:inline-block rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono truncate max-w-[160px]">
                  {w.route.split("?")[0]}
                </span>
              </div>

              {/* Titlebar Actions */}
              <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
                {/* History Back */}
                <button
                  type="button"
                  title="Back (inside window)"
                  onClick={() => {
                    const iframe = document.getElementById(`iframe-${w.id}`) as HTMLIFrameElement | null;
                    try {
                      iframe?.contentWindow?.history.back();
                    } catch {
                      // safe fallback
                    }
                  }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                >
                  <ArrowLeft className="size-3.5" />
                </button>

                {/* History Forward */}
                <button
                  type="button"
                  title="Forward (inside window)"
                  onClick={() => {
                    const iframe = document.getElementById(`iframe-${w.id}`) as HTMLIFrameElement | null;
                    try {
                      iframe?.contentWindow?.history.forward();
                    } catch {
                      // safe fallback
                    }
                  }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                >
                  <ArrowRight className="size-3.5" />
                </button>

                {/* Reload frame */}
                <button
                  type="button"
                  title="Reload frame"
                  onClick={() => {
                    setFrameLoading((prev) => ({ ...prev, [w.id]: true }));
                    const iframe = document.getElementById(`iframe-${w.id}`) as HTMLIFrameElement | null;
                    if (iframe) iframe.src = iframeSrc;
                  }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                >
                  <RotateCw className="size-3.5" />
                </button>

                {/* Copy URL */}
                <button
                  type="button"
                  title="Copy route URL"
                  onClick={() => handleCopyLink(w)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                >
                  {copiedWindowId === w.id ? (
                    <Check className="size-3.5 text-emerald-600" />
                  ) : (
                    <Link2 className="size-3.5" />
                  )}
                </button>

                {/* Open in full browser tab */}
                <a
                  href={w.route}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in new browser tab"
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition inline-flex items-center"
                >
                  <ExternalLink className="size-3.5" />
                </a>

                <div className="mx-1 h-3.5 w-px bg-border/60" />

                {/* Minimize */}
                <button
                  type="button"
                  title="Minimize to Dock"
                  onClick={() => minimizeWindow(w.id)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                >
                  <Minus className="size-3.5" />
                </button>

                {/* Maximize / Restore */}
                {isMaximized ? (
                  <button
                    type="button"
                    title="Restore window size"
                    onClick={() => restoreWindow(w.id)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                  >
                    <Minimize2 className="size-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    title="Maximize window"
                    onClick={() => maximizeWindow(w.id)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                  >
                    <Maximize2 className="size-3.5" />
                  </button>
                )}

                {/* Close */}
                <button
                  type="button"
                  title="Close workbench window"
                  onClick={() => closeWindow(w.id)}
                  className="p-1 rounded hover:bg-red-500/20 hover:text-red-600 text-muted-foreground transition"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Embedded Iframe Body */}
            <div className="relative flex-1 w-full h-full bg-background overflow-hidden">
              {frameLoading[w.id] !== false && (
                <div className="absolute top-0 inset-x-0 h-0.5 z-20 bg-primary/20 overflow-hidden">
                  <div className="h-full bg-primary animate-pulse w-full" />
                </div>
              )}
              <iframe
                id={`iframe-${w.id}`}
                src={iframeSrc}
                title={w.title}
                className={cn(
                  "w-full h-full border-none",
                  isDraggingOrResizing && "pointer-events-none"
                )}
                onLoad={(e) => {
                  setFrameLoading((prev) => ({ ...prev, [w.id]: false }));
                  try {
                    const iframe = e.currentTarget;
                    const path = iframe.contentWindow?.location?.pathname;
                    if (path && path !== w.route) {
                      updateWindowRoute(w.id, path);
                    }
                  } catch {
                    // cross-origin protection safe fallback
                  }
                }}
              />
            </div>

            {/* Resize Handle (floating mode only) */}
            {!isMaximized && (
              <div
                onMouseDown={(e) => startDrag(e, w.id, w.position, true)}
                className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 text-muted-foreground/50 hover:text-foreground z-10"
                title="Resize window"
              >
                <div className="w-2 h-2 border-r-2 border-b-2 border-muted-foreground/60" />
              </div>
            )}
          </div>
        );
      })}

      {/* 2. DOCK TASKBAR STRIP (Bottom of Screen) */}
      <div
        className={cn(
          "fixed bottom-0 inset-x-0 z-[130] flex items-center justify-between border-t border-[var(--topbar-border)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--topbar-control)_95%,white_5%),color-mix(in_oklab,var(--topbar-control)_80%,var(--surface-muted)_20%))] px-2 shadow-lg select-none transition-all",
          isDockCollapsed ? "h-6 opacity-75 hover:opacity-100" : "h-10"
        )}
      >
        {/* Left: Quick Launcher Button */}
        <div className="flex items-center gap-1.5 shrink-0 relative">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-[var(--topbar-border)] px-2 text-xs font-semibold transition shadow-sm",
              menuOpen
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-[var(--topbar-control)] hover:bg-muted text-foreground",
              isDockCollapsed ? "h-5 text-[11px] py-0" : "h-7"
            )}
            title="Open Workspace Dock Launcher (Alt + W)"
          >
            <Plus className="size-3.5 shrink-0" />
            <span>Workspace Dock</span>
            {windows.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold">
                {windows.length}
              </span>
            )}
          </button>

          {/* Full Admin Workspace Launch Center Popover */}
          {menuOpen && (
            <div
              className="fixed sm:absolute bottom-11 left-1 sm:left-2 w-[calc(100vw-8px)] sm:w-[680px] max-h-[82vh] rounded-2xl border border-[var(--topbar-border)] bg-popover/98 p-0 shadow-2xl backdrop-blur-xl z-[140] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Popover Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-muted/30 select-none">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <LayoutGrid className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <span>Admin Workspace Launch Center</span>
                      <span className="rounded-full bg-primary/15 text-primary text-[10px] px-2 py-0.2 font-bold shrink-0">
                        {uniqueRegistryItems.length} Pages
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Open any module, page, report, or workflow inside your desktop dock
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition shrink-0 ml-2"
                  title="Close Launcher (Esc)"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Search & Category Filter Section */}
              <div className="p-3 border-b border-border/40 bg-background/50 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search all 348 admin pages by name, module, route, or keyword (Press Enter to open)..."
                    value={routeSearch}
                    onChange={(e) => setRouteSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSearchSubmit();
                      } else if (e.key === "Escape") {
                        setMenuOpen(false);
                      }
                    }}
                    className="h-9 w-full rounded-lg border border-input bg-background/90 pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1.5 focus:ring-primary shadow-sm"
                  />
                  {routeSearch && (
                    <button
                      type="button"
                      onClick={() => setRouteSearch("")}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5"
                      title="Clear search"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
                  {MODULE_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-1 font-medium transition cursor-pointer select-none",
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
                        )}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Results List Section */}
              <div className="flex-1 max-h-[360px] overflow-y-auto p-2 space-y-1 scrollbar-thin">
                {/* 1. Quick Presets View (When selected and no query) */}
                {selectedCategory === "★ Quick Presets" && !routeSearch.trim() && (
                  <div className="space-y-1">
                    <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Essential Daily Workbenches
                    </div>
                    {filteredPresets.map((preset) => {
                      const Icon = getWindowIcon(preset.icon);
                      return (
                        <div
                          key={preset.route}
                          className="group flex items-center justify-between rounded-lg border border-border/50 p-2 text-xs hover:border-primary/50 hover:bg-muted/60 transition"
                        >
                          <div className="flex items-start gap-2.5 min-w-0 pr-2">
                            <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-muted/60 text-primary shrink-0 group-hover:bg-primary/10">
                              <Icon className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground truncate">{preset.label}</span>
                                <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground truncate max-w-[150px]">
                                  {preset.route.split("?")[0]}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-1">
                                {preset.description}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a
                              href={preset.route}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition"
                              title="Open in new browser tab"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                openInDock(preset.route, preset.label, preset.icon);
                                setMenuOpen(false);
                              }}
                              className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-sm"
                            >
                              Open
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. All Registry Routes / Filtered Results */}
                {(selectedCategory !== "★ Quick Presets" || Boolean(routeSearch.trim())) && (
                  <>
                    {filteredRoutes.length > 0 ? (
                      <div className="space-y-1">
                        <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground flex items-center justify-between">
                          <span>
                            Showing {filteredRoutes.length} {filteredRoutes.length === 1 ? "page" : "pages"}
                            {routeSearch.trim() ? ` matching "${routeSearch}"` : ` in ${selectedCategory}`}
                          </span>
                          <span className="text-[10px]">Press Enter to open top result</span>
                        </div>
                        {filteredRoutes.map((item) => {
                          const Icon = getGroupIcon(item.group);
                          return (
                            <div
                              key={item.href}
                              className="group flex items-center justify-between rounded-lg border border-border/40 p-2 text-xs hover:border-primary/50 hover:bg-muted/60 transition"
                            >
                              <div className="flex items-start gap-2.5 min-w-0 pr-2">
                                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-muted/60 text-primary shrink-0 group-hover:bg-primary/10">
                                  <Icon className="size-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-foreground">{item.label}</span>
                                    <span className="rounded bg-primary/10 text-primary px-1.5 py-0.2 text-[10px] font-medium shrink-0">
                                      {item.group}
                                    </span>
                                    <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground truncate max-w-[170px]">
                                      {item.href.split("?")[0]}
                                    </span>
                                  </div>
                                  {item.description && (
                                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                                      {item.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <a
                                  href={item.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition"
                                  title="Open in new browser tab"
                                >
                                  <ExternalLink className="size-3.5" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => {
                                    openInDock(item.href, item.label, routeToDefaultIcon(item.href));
                                    setMenuOpen(false);
                                    setRouteSearch("");
                                  }}
                                  className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-sm"
                                >
                                  Open
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-muted-foreground space-y-2">
                        <p className="text-xs">
                          No registered page found for &ldquo;<span className="text-foreground font-semibold">{routeSearch}</span>&rdquo;
                        </p>
                        {routeSearch.trim().startsWith("/") && (
                          <button
                            type="button"
                            onClick={() => {
                              const sanitized = sanitizeAdminRoute(routeSearch.trim());
                              if (sanitized) {
                                openInDock(sanitized);
                                setMenuOpen(false);
                                setRouteSearch("");
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 text-primary border border-primary/30 px-3 py-1.5 text-xs font-semibold hover:bg-primary/20 transition"
                          >
                            <Plus className="size-3.5" />
                            Open custom route &ldquo;{routeSearch.trim()}&rdquo; in dock
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Popover Footer: Custom Route Direct Input & Keyboard Shortcuts */}
              <div className="p-3 border-t border-border/60 bg-muted/20 select-none">
                <form onSubmit={handleLaunchCustomRoute} className="flex gap-2 items-center">
                  <span className="text-[11px] font-semibold text-muted-foreground shrink-0 hidden sm:inline">
                    Direct Route:
                  </span>
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="/admin/... (e.g. /admin/inventory/stock-needs)"
                      value={customRouteInput}
                      onChange={(e) => {
                        setCustomRouteInput(e.target.value);
                        if (customRouteError) setCustomRouteError(null);
                      }}
                      className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-sm shrink-0"
                  >
                    Open
                  </button>
                </form>
                {customRouteError && (
                  <div className="mt-1 text-[11px] text-red-500 font-medium">
                    {customRouteError}
                  </div>
                )}

                <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-1.5">
                  <span className="flex items-center gap-1">
                    💡 Hold <kbd className="px-1 py-0.5 border rounded bg-muted font-sans font-medium text-[9px]">Alt</kbd> + click any link in the dashboard to dock
                  </span>
                  <span className="flex items-center gap-2">
                    <span><kbd className="px-1 border rounded bg-muted font-sans font-medium text-[9px]">Alt+W</kbd> Toggle</span>
                    <span><kbd className="px-1 border rounded bg-muted font-sans font-medium text-[9px]">Alt+D</kbd> Dashboard</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center: Scrollable Taskbar Chips for Open Windows */}
        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto px-2 scrollbar-none">
          {windows.map((w) => {
            const isMinimized = w.state === "minimized";
            const isActive = activeWindowId === w.id && !isMinimized;
            const Icon = getWindowIcon(w.icon);

            return (
              <div
                key={w.id}
                className={cn(
                  "group inline-flex items-center gap-1.5 rounded-md border px-2 text-xs transition cursor-pointer select-none shrink-0 max-w-[190px]",
                  isActive
                    ? "border-primary/60 bg-primary/15 text-primary font-semibold shadow-sm"
                    : isMinimized
                    ? "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    : "border-border bg-card/70 text-foreground hover:bg-muted/60",
                  isDockCollapsed ? "h-5 text-[11px] py-0" : "h-7"
                )}
                onClick={() => {
                  if (isActive) {
                    minimizeWindow(w.id);
                  } else {
                    restoreWindow(w.id);
                  }
                }}
                title={`${w.title} (${isMinimized ? "Minimized - Click to restore" : "Active - Click to minimize"})`}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full shrink-0",
                    isActive
                      ? "bg-emerald-500 animate-pulse"
                      : isMinimized
                      ? "bg-amber-400"
                      : "bg-primary/80"
                  )}
                />
                <Icon className="size-3 shrink-0" />
                <span className="truncate">{w.title}</span>

                {/* Close chip button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeWindow(w.id);
                  }}
                  className="ml-1 rounded p-0.5 hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100 transition"
                  title="Close window"
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}

          {lastClosedWindow && (
            <button
              type="button"
              onClick={reopenLastClosed}
              className={cn(
                "inline-flex items-center gap-1 rounded border border-dashed border-primary/60 bg-primary/10 px-2 text-[11px] font-medium text-primary hover:bg-primary/20 transition cursor-pointer shrink-0",
                isDockCollapsed ? "h-5 text-[10px]" : "h-7"
              )}
              title={`Undo close: reopen ${lastClosedWindow.title}`}
            >
              <Undo2 className="size-3 shrink-0" />
              <span className="truncate max-w-[130px]">Reopen {lastClosedWindow.title}</span>
            </button>
          )}

          {windows.length === 0 && !lastClosedWindow && (
            <span className="text-[11px] text-muted-foreground italic hidden sm:inline-block">
              No docked workbenches. Click + or hold <kbd className="px-1 py-0.5 border rounded bg-muted/60 text-[10px]">Alt</kbd> + click any link to open inside dashboard.
            </span>
          )}
        </div>

        {/* Right: Layout Controls & Tiling */}
        <div className="flex items-center gap-1 shrink-0">
          {windows.length > 1 && (
            <>
              {/* Tile Windows 50/50 */}
              <button
                type="button"
                onClick={() => tileWindows("horizontal")}
                className={cn(
                  "inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition",
                  isDockCollapsed ? "h-5" : "h-7"
                )}
                title="Tile windows side-by-side (50/50 comparison)"
              >
                <Columns2 className="size-3" />
                <span className="hidden md:inline">Tile</span>
              </button>

              {/* Minimize All */}
              <button
                type="button"
                onClick={minimizeAll}
                className={cn(
                  "inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition",
                  isDockCollapsed ? "h-5" : "h-7"
                )}
                title="Minimize all windows to dock (Show Dashboard - Alt+D)"
              >
                <Minus className="size-3" />
                <span className="hidden md:inline">Show Dashboard</span>
              </button>

              {/* Close All */}
              <button
                type="button"
                onClick={closeAll}
                className={cn(
                  "inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 text-[11px] text-muted-foreground hover:bg-red-500/20 hover:text-red-600 transition",
                  isDockCollapsed ? "h-5" : "h-7"
                )}
                title="Close all open windows"
              >
                <X className="size-3" />
                <span className="hidden md:inline">Close All</span>
              </button>
            </>
          )}

          {/* Collapse/Expand Dock Strip */}
          <button
            type="button"
            onClick={() => setIsDockCollapsed((prev) => !prev)}
            className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition"
            title={isDockCollapsed ? "Expand Dock" : "Collapse Dock"}
          >
            {isDockCollapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
      </div>
    </>
  );
}
