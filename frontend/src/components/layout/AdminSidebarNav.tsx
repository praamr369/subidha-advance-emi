"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  Command,
  Search,
  Star,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  badgeSource?: string;
  children?: AdminNavItem[];
};

export type AdminNavGroup = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: AdminNavItem[];
};

type AdminSidebarNavProps = {
  groups: AdminNavGroup[];
  activeHref: string | null;
  brandName: string;
  roleLabel: string;
  isMobile: boolean;
  navQuery: string;
  onNavQueryChange: (value: string) => void;
  expandedGroups: Record<string, boolean>;
  onToggleGroup: (title: string, defaultOpen: boolean) => void;
  favorites: string[];
  onToggleFavorite: (href: string) => void;
  canFavorite: boolean;
  badges: Record<string, number>;
  favoriteLinks: AdminNavItem[];
  brandSlot: ReactNode;
  footerSlot: ReactNode;
  onToggleCollapse: () => void;
  onClose?: () => void;
};

function flatten(items: AdminNavItem[]): AdminNavItem[] {
  return items.flatMap((item) =>
    item.children?.length ? [item, ...flatten(item.children)] : [item]
  );
}

function isGroupActive(group: AdminNavGroup, activeHref: string | null): boolean {
  if (!activeHref) return false;
  return flatten(group.items).some((item) => item.href === activeHref);
}

export default function AdminSidebarNav({
  groups,
  activeHref,
  brandName,
  roleLabel,
  isMobile,
  navQuery,
  onNavQueryChange,
  expandedGroups,
  onToggleGroup,
  favorites,
  onToggleFavorite,
  canFavorite,
  badges,
  favoriteLinks,
  brandSlot,
  footerSlot,
  onToggleCollapse,
  onClose,
}: AdminSidebarNavProps) {
  const searching = navQuery.trim().length > 0;

  const groupMeta = useMemo(
    () =>
      groups.map((group) => ({
        title: group.title,
        count: flatten(group.items).filter((i) => !i.children?.length).length,
        active: isGroupActive(group, activeHref),
      })),
    [groups, activeHref]
  );

  function renderItem(item: AdminNavItem, depth = 0): ReactNode {
    const Icon = item.icon;
    const active = item.href === activeHref;
    const childActive = item.children
      ? flatten(item.children).some((c) => c.href === activeHref)
      : false;
    const badgeCount = item.badgeSource ? badges[item.badgeSource] ?? 0 : 0;
    const isFav = favorites.includes(item.href);

    if (item.disabled) {
      return (
        <div
          key={`${item.href}:${item.label}:${depth}`}
          className="flex min-h-[2.5rem] items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium text-[var(--sidebar-item-muted)] opacity-55"
          aria-disabled="true"
          title="Not available yet"
        >
          <Icon className="h-[1.05rem] w-[1.05rem] shrink-0" />
          <span className="truncate">{item.label}</span>
        </div>
      );
    }

    return (
      <div key={`${item.href}:${item.label}:${depth}`}>
        <div
          className={cn(
            "group/navrow relative flex min-h-[2.5rem] items-center rounded-xl transition-colors",
            active
              ? "bg-[color-mix(in_oklab,var(--sidebar-primary)_16%,transparent)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--sidebar-primary)_30%,transparent)]"
              : "hover:bg-card/[0.05]"
          )}
        >
          {active ? (
            <span
              className="absolute left-1 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[var(--sidebar-primary)]"
              aria-hidden
            />
          ) : null}
          <Link
            href={item.href}
            onClick={isMobile ? onClose : undefined}
            aria-current={active ? "page" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
            style={depth > 0 ? { paddingLeft: `${0.75 + depth * 0.85}rem` } : undefined}
          >
            <Icon
              className={cn(
                "h-[1.05rem] w-[1.05rem] shrink-0 transition-colors",
                active || childActive
                  ? "text-[var(--sidebar-primary)]"
                  : "text-[var(--sidebar-item-muted)] group-hover/navrow:text-[var(--sidebar-foreground)]"
              )}
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[13px]",
                active
                  ? "font-semibold text-[var(--sidebar-foreground)]"
                  : "font-medium text-[var(--sidebar-item-muted)] group-hover/navrow:text-[var(--sidebar-foreground)]"
              )}
            >
              {item.label}
            </span>
          </Link>

          {badgeCount > 0 ? (
            <span className="mr-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--sidebar-primary)] px-1.5 text-[11px] font-semibold leading-5 text-white">
              {badgeCount}
            </span>
          ) : null}

          {canFavorite && !item.children?.length ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleFavorite(item.href);
              }}
              className={cn(
                "mr-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-item-muted)] transition hover:bg-card/[0.07] hover:text-[var(--sidebar-primary)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45",
                isFav
                  ? "opacity-100 text-[var(--sidebar-primary)]"
                  : "opacity-0 group-hover/navrow:opacity-100"
              )}
              aria-label={isFav ? "Remove pin" : "Pin to favorites"}
              title={isFav ? "Pinned" : "Pin"}
            >
              <Star
                className={cn(
                  "h-[0.95rem] w-[0.95rem]",
                  isFav ? "fill-[var(--sidebar-primary)]" : ""
                )}
              />
            </button>
          ) : null}
        </div>

        {item.children?.length ? (
          <div className="mt-0.5 space-y-0.5 border-l border-white/[0.08] pl-2">
            {item.children.map((child) => renderItem(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3.5 pb-2">
        <div className="flex items-center gap-3 rounded-2xl bg-card/[0.04] px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]">
          {brandSlot}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold leading-tight tracking-tight text-[var(--sidebar-foreground)]">
              {brandName}
            </div>
            <div className="truncate text-[11px] font-medium text-[var(--sidebar-section-label)]">
              {roleLabel} workspace
            </div>
          </div>
          <button
            type="button"
            onClick={isMobile ? onClose : onToggleCollapse}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-item-muted)] transition hover:bg-card/[0.07] hover:text-[var(--sidebar-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
            aria-label={isMobile ? "Close sidebar" : "Collapse sidebar"}
            title={isMobile ? "Close" : "Collapse"}
          >
            {isMobile ? <X className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Command bar / search */}
      <div className="shrink-0 px-3 pb-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sidebar-item-muted)]" />
          <input
            type="search"
            value={navQuery}
            onChange={(event) => onNavQueryChange(event.target.value)}
            placeholder="Search modules"
            aria-label="Search modules"
            className="h-10 w-full rounded-xl bg-card/[0.04] pl-9 pr-12 text-[13px] text-[var(--sidebar-foreground)] ring-1 ring-inset ring-white/[0.07] placeholder:text-[var(--sidebar-item-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--sidebar-ring)]/45"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-card/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--sidebar-item-muted)]">
            <Command className="h-3 w-3" />K
          </span>
        </div>
      </div>

      {/* Scroll area */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label={`${roleLabel} navigation`}>
        {/* Pinned */}
        {favoriteLinks.length > 0 && !searching ? (
          <div className="mb-3">
            <div className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--sidebar-section-label)]">
              Pinned
            </div>
            <div className="space-y-0.5">
              {favoriteLinks.map((item) => renderItem(item))}
            </div>
          </div>
        ) : null}

        {/* Category accordion */}
        <div className="space-y-1">
          {groups.map((group, index) => {
            const meta = groupMeta[index];
            const GroupIcon = group.icon;
            const open =
              searching || meta.active || (expandedGroups[group.title] ?? meta.active);
            return (
              <div
                key={group.title}
                className={cn(
                  "rounded-2xl",
                  open ? "bg-card/[0.02] ring-1 ring-inset ring-white/[0.05]" : ""
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggleGroup(group.title, meta.active)}
                  className="flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2.5 text-left transition hover:bg-card/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
                  aria-expanded={open}
                >
                  <span
                    className={cn(
                      "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-colors",
                      meta.active
                        ? "bg-[color-mix(in_oklab,var(--sidebar-primary)_18%,transparent)] text-[var(--sidebar-primary)] ring-[color-mix(in_oklab,var(--sidebar-primary)_30%,transparent)]"
                        : "bg-card/[0.04] text-[var(--sidebar-item-muted)] ring-white/[0.06]"
                    )}
                  >
                    <GroupIcon className="h-[1.05rem] w-[1.05rem]" />
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[12.5px] font-semibold tracking-tight",
                      meta.active
                        ? "text-[var(--sidebar-foreground)]"
                        : "text-[var(--sidebar-item-muted)]"
                    )}
                  >
                    {group.title}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-[var(--sidebar-section-label)]">
                    {meta.count}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-[var(--sidebar-item-muted)] transition-transform",
                      open ? "rotate-0" : "-rotate-90"
                    )}
                  />
                </button>
                {open ? (
                  <div className="space-y-0.5 px-1.5 pb-2">
                    {group.items.map((item) => renderItem(item))}
                  </div>
                ) : null}
              </div>
            );
          })}
          {groups.length === 0 ? (
            <div className="rounded-xl bg-card/[0.03] px-3 py-6 text-center text-[13px] text-[var(--sidebar-item-muted)]">
              No modules match “{navQuery}”.
            </div>
          ) : null}
        </div>
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-white/[0.07] px-3 py-2.5">
        {footerSlot}
      </div>
    </div>
  );
}
