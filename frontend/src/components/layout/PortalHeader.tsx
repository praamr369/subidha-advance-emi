import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PortalHeaderProps = {
  children: ReactNode;
  className?: string;
};

export default function PortalHeader({ children, className }: PortalHeaderProps) {
  return (
    <header
      className={cn(
        "dashboard-shell-chrome sticky top-0 z-30 border-b border-[var(--topbar-border)]",
        "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--topbar-surface)_96%,white_4%),color-mix(in_oklab,var(--topbar-surface)_90%,var(--surface-muted)_10%))] backdrop-blur-xl",
        "shadow-[0_12px_34px_-28px_rgba(15,23,42,0.42)]",
        className
      )}
    >
      {children}
    </header>
  );
}
