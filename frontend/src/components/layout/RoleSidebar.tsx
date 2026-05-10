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
            className="dashboard-shell-chrome fixed inset-0 z-40 bg-slate-950/62 backdrop-blur-[3px] md:hidden"
          />
        ) : null}
        <aside
          className={cn(
            "dashboard-shell-chrome fixed inset-y-0 left-0 z-50 flex min-h-0 w-[min(20rem,calc(100vw-1.5rem))] flex-col border-r border-[var(--sidebar-rail-border)] text-[var(--sidebar-foreground)] transition-transform duration-200 md:hidden",
            "bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_26%),linear-gradient(180deg,var(--sidebar-surface),color-mix(in_oklab,var(--sidebar-surface-alt)_74%,black_26%))]",
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
        "dashboard-shell-chrome flex h-screen min-h-0 flex-col border-r border-[var(--sidebar-rail-border)] text-[var(--sidebar-foreground)] transition-[width] duration-200",
        "bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_26%),linear-gradient(180deg,var(--sidebar-surface),color-mix(in_oklab,var(--sidebar-surface-alt)_74%,black_26%))]",
        "shadow-[24px_0_60px_-52px_rgba(15,23,42,0.82)]",
        collapsed ? "w-[6rem]" : "w-64",
        className
      )}
    >
      {children}
    </aside>
  );
}
