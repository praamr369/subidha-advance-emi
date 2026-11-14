"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Columns2,
  CreditCard,
  ExternalLink,
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
  Truck,
  Undo2,
  Users,
  X,
} from "lucide-react";

import {
  useAdminWorkspaceDock,
  sanitizeAdminRoute,
  type DockWindow,
  type DockWindowPosition,
} from "./AdminWorkspaceDockContext";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";

const QUICK_DOCK_PRESETS = [
  { label: "Customers", route: ROUTES.admin.customers, icon: "users" },
  { label: "New SFEMI Contract", route: ROUTES.admin.subscriptionsAdvanceEmiCreate, icon: "clipboard" },
  { label: "Collect Payment", route: ROUTES.admin.financeCollect, icon: "credit-card" },
  { label: "Direct Sale (Billing)", route: ROUTES.admin.billingDirectSaleCreate, icon: "receipt" },
  { label: "Inventory & Stock Needs", route: "/admin/inventory/stock-needs", icon: "boxes" },
  { label: "Day Close & Accounting", route: ROUTES.admin.accounting, icon: "landmark" },
  { label: "Deliveries", route: ROUTES.admin.delivery, icon: "truck" },
  { label: "CRM Workbench", route: ROUTES.admin.crm, icon: "handshake" },
];

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
  const [customRouteInput, setCustomRouteInput] = useState("");
  const [copiedWindowId, setCopiedWindowId] = useState<string | null>(null);
  const [frameLoading, setFrameLoading] = useState<Record<string, boolean>>({});
  const [customRouteError, setCustomRouteError] = useState<string | null>(null);

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

  if (!isDockSupported) {
    return null;
  }

  const filteredPresets = QUICK_DOCK_PRESETS.filter((p) =>
    p.label.toLowerCase().includes(routeSearch.toLowerCase()) ||
    p.route.toLowerCase().includes(routeSearch.toLowerCase())
  );

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

          {/* Launcher Popover Menu */}
          {menuOpen && (
            <div
              className="absolute bottom-11 left-0 w-80 rounded-xl border border-border bg-popover/98 p-3 shadow-2xl backdrop-blur-md z-[140] animate-in fade-in slide-in-from-bottom-2"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-border/60">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <LayoutGrid className="size-3.5 text-primary" />
                  Quick Launch Workbench
                </span>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              {/* Search Presets */}
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter admin routes…"
                  value={routeSearch}
                  onChange={(e) => setRouteSearch(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background/80 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Presets List */}
              <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
                {filteredPresets.map((preset) => {
                  const Icon = getWindowIcon(preset.icon);
                  return (
                    <button
                      key={preset.route}
                      type="button"
                      onClick={() => {
                        openInDock(preset.route, preset.label, preset.icon);
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted/70 transition text-left"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Icon className="size-3.5 text-primary shrink-0" />
                        <span className="font-medium truncate">{preset.label}</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {preset.route.split("?")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Route Input */}
              <form onSubmit={handleLaunchCustomRoute} className="mt-3 pt-2 border-t border-border/60">
                <div className="text-[11px] font-medium text-muted-foreground mb-1">
                  Custom Admin Route:
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="/admin/..."
                    value={customRouteInput}
                    onChange={(e) => setCustomRouteInput(e.target.value)}
                    className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs font-mono"
                  />
                  <button
                    type="submit"
                    className="h-7 rounded bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Open
                  </button>
                </div>
                {customRouteError && (
                  <div className="mt-1 text-[11px] text-red-500 font-medium">
                    {customRouteError}
                  </div>
                )}
              </form>

              <div className="mt-2.5 pt-1.5 border-t border-border/40 text-[10px] text-muted-foreground flex justify-between">
                <span>Hold <kbd className="px-1 border rounded bg-muted">Alt</kbd> + click any link</span>
                <span>Alt+W to toggle</span>
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
