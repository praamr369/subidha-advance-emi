// frontend/src/components/layout/AdminDesktopStatusBar.tsx
"use client";

import { usePathname } from "next/navigation";
import { Activity, Command, Zap } from "lucide-react";
import { useAdminDesktopZoom } from "@/lib/admin-desktop-zoom";

export default function AdminDesktopStatusBar({
  onOpenCommandPalette,
  onOpenQuickActions,
}: {
  onOpenCommandPalette?: () => void;
  onOpenQuickActions?: () => void;
}) {
  const pathname = usePathname() || "";
  const { zoom } = useAdminDesktopZoom();
  const zoomPercent = Math.round(Number(zoom) * 100);

  // Derive human-readable current section
  const section = pathname.replace(/^\/admin\/?/, "").split("/")[0] || "dashboard";
  const sectionTitle = section.charAt(0).toUpperCase() + section.slice(1).replace(/-/g, " ");

  return (
    <footer className="hidden h-7 shrink-0 items-center justify-between border-t border-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--topbar-control)_90%,white_10%),color-mix(in_oklab,var(--topbar-control)_80%,var(--surface-muted)_20%))] px-3 text-[11px] font-medium text-muted-foreground select-none lg:flex">
      {/* Left: System status & active module */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-foreground/90">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-semibold">Subidha ERP Core</span>
        </div>
        <span className="text-border">|</span>
        <span className="text-foreground/75 font-medium">{sectionTitle}</span>
      </div>

      {/* Center: Desktop shortcuts */}
      <div className="flex items-center gap-4 text-xs">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          title="Open Command Palette (Ctrl + K)"
        >
          <Command className="size-3" />
          <span>Ctrl+K</span>
        </button>
        <span className="text-border">·</span>
        <button
          type="button"
          onClick={onOpenQuickActions}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          title="Open Quick Actions Panel"
        >
          <Zap className="size-3 text-amber-500" />
          <span>Quick Actions</span>
        </button>
      </div>

      {/* Right: Scale & status */}
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-foreground/80 border border-border/50">
          <Activity className="size-2.5 text-emerald-600" />
          {zoomPercent}% Desktop Mode
        </span>
        <span className="text-border">|</span>
        <span>Solopreneur Admin</span>
      </div>
    </footer>
  );
}

