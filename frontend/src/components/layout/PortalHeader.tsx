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
        "bg-[color-mix(in_oklab,var(--topbar-surface)_92%,white_8%)] backdrop-blur-xl",
        className
      )}
    >
      {children}
    </header>
  );
}
