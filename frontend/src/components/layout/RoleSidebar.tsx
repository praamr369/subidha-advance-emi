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
            className="dashboard-shell-chrome fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[1px] md:hidden"
          />
        ) : null}
        <aside
          className={cn(
            "dashboard-shell-chrome fixed inset-y-0 left-0 z-50 w-[18.75rem] border-r border-[var(--sidebar-rail-border)] text-[var(--sidebar-foreground)] transition-transform duration-200 md:hidden",
            "bg-[linear-gradient(180deg,var(--sidebar-surface),color-mix(in_oklab,var(--sidebar-surface-alt)_74%,black_26%))]",
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
        "dashboard-shell-chrome h-screen border-r border-[var(--sidebar-rail-border)] text-[var(--sidebar-foreground)] transition-[width] duration-200",
        "bg-[linear-gradient(180deg,var(--sidebar-surface),color-mix(in_oklab,var(--sidebar-surface-alt)_74%,black_26%))]",
        collapsed ? "w-[5.8rem]" : "w-[19rem]",
        className
      )}
    >
      {children}
    </aside>
  );
}
