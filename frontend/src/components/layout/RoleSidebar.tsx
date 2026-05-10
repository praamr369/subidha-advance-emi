import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type RoleSidebarProps = {
  children: ReactNode;
  collapsed?: boolean;
  mobileOpen?: boolean;
  mobile?: boolean;
  onOverlayClick?: () => void;
  className?: string;
};

export default function RoleSidebar({
  children,
  collapsed = false,
  mobileOpen = false,
  mobile = false,
  onOverlayClick,
  className,
}: RoleSidebarProps) {
  if (mobile) {
    return (
      <>
        {mobileOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onOverlayClick}
            className="dashboard-shell-chrome fixed inset-0 z-40 bg-[color-mix(in_oklab,black_55%,transparent)] backdrop-blur-[3px] md:hidden dark:bg-[color-mix(in_oklab,black_72%,transparent)]"
          />
        ) : null}
        <aside
          className={cn(
            "dashboard-shell-chrome fixed inset-y-0 left-0 z-50 flex min-h-0 w-[min(20rem,min(85vw,calc(100vw-1.5rem)))] flex-col border-r border-[var(--sidebar-rail-border)]/80 text-[var(--sidebar-foreground)] transition-transform duration-200 md:hidden",
            "bg-[radial-gradient(circle_at_top_left,rgba(217,119,6,0.06),transparent_32%),linear-gradient(180deg,var(--sidebar-surface),color-mix(in_oklab,var(--sidebar-surface-alt)_78%,black_22%))]",
            "shadow-[0_30px_90px_-58px_rgba(15,23,42,0.84)]",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
            className
          )}
        >
          {children}
        </aside>
      </>
    );
  }

  return (
    <aside
      className={cn(
        "dashboard-shell-chrome flex h-screen min-h-0 flex-col border-r border-[var(--sidebar-rail-border)]/80 text-[var(--sidebar-foreground)] transition-[width] duration-200",
        "bg-[radial-gradient(circle_at_top_left,rgba(217,119,6,0.055),transparent_30%),linear-gradient(180deg,var(--sidebar-surface),color-mix(in_oklab,var(--sidebar-surface-alt)_76%,black_24%))]",
        "shadow-[24px_0_60px_-52px_rgba(28,25,23,0.45)]",
        collapsed ? "w-[6rem]" : "w-[260px]",
        className
      )}
    >
      {children}
    </aside>
  );
}
