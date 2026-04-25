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
        "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--topbar-surface)_92%,white_8%),color-mix(in_oklab,var(--topbar-surface)_84%,var(--surface-muted)_16%))] backdrop-blur-xl",
        "shadow-[0_14px_38px_-30px_rgba(15,23,42,0.46)]",
        className
      )}
    >
      {children}
    </header>
  );
}
