"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toggleMaximizeWindow, isTauriDesktop } from "@/lib/desktop/tauri-bridge";

type PortalHeaderProps = {
  children: ReactNode;
  className?: string;
};

export default function PortalHeader({ children, className }: PortalHeaderProps) {
  const handleDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!isTauriDesktop()) return;
    const target = e.target as HTMLElement;
    // Only toggle maximize when double clicking background or header bar, not interactive buttons/inputs
    if (
      target.tagName === "HEADER" ||
      target.classList.contains("dashboard-shell-chrome") ||
      target.getAttribute("data-tauri-drag-region") === "true"
    ) {
      toggleMaximizeWindow();
    }
  };

  return (
    <header
      data-tauri-drag-region="true"
      onDoubleClick={handleDoubleClick}
      className={cn(
        "dashboard-shell-chrome sticky top-0 z-30 border-b border-[var(--topbar-border)] select-none",
        "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--topbar-surface)_92%,white_8%),color-mix(in_oklab,var(--topbar-surface)_84%,var(--surface-muted)_16%))] backdrop-blur-xl",
        "shadow-[0_14px_38px_-30px_rgba(15,23,42,0.46)]",
        className
      )}
    >
      {children}
    </header>
  );
}
