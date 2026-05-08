"use client";

import Link from "next/link";

type SidebarHoverCardAction = {
  label: string;
  href: string;
};

type SidebarHoverCardProps = {
  title: string;
  counts: Array<{ label: string; value: number }>;
  quickActions: SidebarHoverCardAction[];
  recentRoutes: SidebarHoverCardAction[];
  primaryAction?: SidebarHoverCardAction;
};

export default function SidebarHoverCard({
  title,
  counts,
  quickActions,
  recentRoutes,
  primaryAction,
}: SidebarHoverCardProps) {
  return (
    <div className="absolute left-full top-0 z-50 ml-3 w-72 rounded-2xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface)_88%,black_12%)] p-3 shadow-[0_22px_50px_-34px_rgba(15,23,42,0.62)]">
      <div className="rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_70%,transparent)] px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">
          {title}
        </div>
      </div>

      {primaryAction ? (
        <Link
          href={primaryAction.href}
          className="mt-2 block rounded-xl border border-[var(--sidebar-item-active-border)] bg-[var(--sidebar-item-active)] px-3 py-2 text-xs font-semibold text-white"
        >
          {primaryAction.label}
        </Link>
      ) : null}

      {counts.length ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {counts.map((count) => (
            <div key={count.label} className="rounded-lg border border-[var(--sidebar-rail-border)] px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-[var(--sidebar-section-label)]">{count.label}</div>
              <div className="text-sm font-semibold text-white">{count.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {quickActions.length ? (
        <div className="mt-2 space-y-1">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href} className="block rounded-lg px-2 py-1.5 text-xs text-white hover:bg-[var(--sidebar-item-hover)]">
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}

      {recentRoutes.length ? (
        <div className="mt-2 border-t border-[var(--sidebar-rail-border)] pt-2">
          <div className="px-2 text-[10px] uppercase tracking-wide text-[var(--sidebar-section-label)]">Recent</div>
          <div className="mt-1 space-y-1">
            {recentRoutes.map((route) => (
              <Link key={route.href} href={route.href} className="block rounded-lg px-2 py-1.5 text-xs text-[var(--sidebar-item-muted)] hover:bg-[var(--sidebar-item-hover)] hover:text-white">
                {route.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
