// frontend/src/components/layout/NavigationCustomizerWorkspace.tsx
"use client";

import React, { useState, useSyncExternalStore, useMemo } from "react";
import {
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  RotateCcw,
  Check,
  Edit2,
  LayoutGrid,
  SlidersHorizontal,
  ChevronDown,
  Search,
  X,
  Sparkles,
} from "lucide-react";
import { getNavigationGroupsForRole, type NavGroup, type NavItem } from "@/config/navigation";
import {
  readNavLayout,
  readNavLayoutServer,
  writeNavLayout,
  resetNavLayout,
  subscribeNavLayout,
  type CustomNavLayout,
} from "@/lib/navigation-prefs";
import { cn } from "@/lib/utils";

interface NavigationCustomizerWorkspaceProps {
  onClose?: () => void;
  isModal?: boolean;
}

export default function NavigationCustomizerWorkspace({ onClose }: NavigationCustomizerWorkspaceProps) {
  const layout: CustomNavLayout = useSyncExternalStore(subscribeNavLayout, readNavLayout, readNavLayoutServer);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [customNameInput, setCustomNameInput] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");

  const rawCanonicalGroups = useMemo(() => getNavigationGroupsForRole("ADMIN"), []);

  // Compute current module order
  const orderedGroups = useMemo(() => {
    const order: string[] = layout.moduleOrder ?? rawCanonicalGroups.map((g: NavGroup) => g.title);
    const map = new Map<string, number>(order.map((t: string, idx: number) => [t, idx]));
    const cloned = [...rawCanonicalGroups];
    cloned.sort((a: NavGroup, b: NavGroup) => {
      const idxA = map.get(a.title) ?? 9999;
      const idxB = map.get(b.title) ?? 9999;
      return idxA - idxB;
    });
    return cloned;
  }, [rawCanonicalGroups, layout.moduleOrder]);

  const normalizedQuery = query.trim().toLowerCase();

  // Aggregate stats
  const stats = useMemo(() => {
    let totalPages = 0;
    orderedGroups.forEach((g) => (totalPages += g.items.length));
    const hidden = (layout.hiddenHrefs ?? []).length;
    const renamed = Object.keys(layout.customGroupNames ?? {}).length;
    return { modules: orderedGroups.length, totalPages, hidden, renamed };
  }, [orderedGroups, layout.hiddenHrefs, layout.customGroupNames]);

  const hasCustomizations =
    Boolean(layout.moduleOrder) ||
    Boolean(layout.pageOrders && Object.keys(layout.pageOrders).length) ||
    Boolean(layout.hiddenHrefs && layout.hiddenHrefs.length) ||
    Boolean(layout.customGroupNames && Object.keys(layout.customGroupNames).length);

  const handleMoveGroup = (index: number, direction: "up" | "down") => {
    const currentOrder = orderedGroups.map((g: NavGroup) => g.title);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;
    const temp = currentOrder[index];
    currentOrder[index] = currentOrder[targetIndex];
    currentOrder[targetIndex] = temp;
    writeNavLayout({ ...layout, moduleOrder: currentOrder });
  };

  const handleRenameGroup = (originalTitle: string) => {
    if (!customNameInput.trim()) {
      setEditingGroup(null);
      return;
    }
    const nextNames: Record<string, string> = { ...(layout.customGroupNames || {}) };
    if (customNameInput.trim() === originalTitle) {
      delete nextNames[originalTitle];
    } else {
      nextNames[originalTitle] = customNameInput.trim();
    }
    writeNavLayout({ ...layout, customGroupNames: nextNames });
    setEditingGroup(null);
  };

  const handleToggleHideItem = (href: string) => {
    const currentHidden = new Set<string>(layout.hiddenHrefs || []);
    if (currentHidden.has(href)) currentHidden.delete(href);
    else currentHidden.add(href);
    writeNavLayout({ ...layout, hiddenHrefs: Array.from(currentHidden) });
  };

  const handleMoveItem = (groupTitle: string, itemIndex: number, direction: "up" | "down", items: NavItem[]) => {
    const targetIndex = direction === "up" ? itemIndex - 1 : itemIndex + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const currentOrder: string[] = items.map((i: NavItem) => i.href);
    const temp = currentOrder[itemIndex];
    currentOrder[itemIndex] = currentOrder[targetIndex];
    currentOrder[targetIndex] = temp;
    const nextPageOrders: Record<string, string[]> = { ...(layout.pageOrders || {}) };
    nextPageOrders[groupTitle] = currentOrder;
    writeNavLayout({ ...layout, pageOrders: nextPageOrders });
  };

  const toggleExpand = (title: string) => {
    setExpandedGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      {/* Header */}
      <div className="relative shrink-0 overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-transparent" />
        <div className="relative flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                Navigation Builder
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-500">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Live
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Reorder modules, rearrange pages, rename sections, or hide unused screens.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!hasCustomizations}
              onClick={() => {
                if (window.confirm("Reset all sidebar customizations back to system defaults?")) {
                  resetNavLayout();
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-all hover:bg-primary/90 hover:shadow-lg"
              >
                <Check className="h-3.5 w-3.5" />
                Done &amp; Apply
              </button>
            )}
          </div>
        </div>

        {/* Stat strip */}
        <div className="relative grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
          <StatCell label="Modules" value={stats.modules} />
          <StatCell label="Total Pages" value={stats.totalPages} />
          <StatCell label="Hidden" value={stats.hidden} tone={stats.hidden ? "amber" : "muted"} />
          <StatCell label="Renamed" value={stats.renamed} tone={stats.renamed ? "primary" : "muted"} />
        </div>
      </div>

      {/* Search bar */}
      <div className="shrink-0 border-b border-border bg-muted/30 px-6 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules and pages…"
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content Body */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4 sm:p-6">
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs font-medium text-primary">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>Tip: As you move modules up or down, your sidebar on the left updates instantly in real time.</span>
        </div>

        {orderedGroups.map((group: NavGroup, groupIndex: number) => {
          const displayTitle = layout.customGroupNames?.[group.title] || group.title;
          const isEditing = editingGroup === group.title;

          // Sort group items if custom pageOrder exists
          const customPageOrder: string[] | undefined = layout.pageOrders?.[group.title];
          const sortedItems = [...group.items];
          if (customPageOrder) {
            const orderMap = new Map<string, number>(customPageOrder.map((href: string, idx: number) => [href, idx]));
            sortedItems.sort((a: NavItem, b: NavItem) => {
              const idxA = orderMap.get(a.href) ?? 9999;
              const idxB = orderMap.get(b.href) ?? 9999;
              return idxA - idxB;
            });
          }

          // Apply search filter
          const matchedItems = normalizedQuery
            ? sortedItems.filter(
                (i) =>
                  i.label.toLowerCase().includes(normalizedQuery) ||
                  i.href.toLowerCase().includes(normalizedQuery)
              )
            : sortedItems;
          const groupMatchesTitle =
            !normalizedQuery ||
            displayTitle.toLowerCase().includes(normalizedQuery) ||
            group.title.toLowerCase().includes(normalizedQuery);
          if (normalizedQuery && !groupMatchesTitle && matchedItems.length === 0) return null;

          // Auto-expand when searching produces child matches
          const isExpanded = (expandedGroups[group.title] ?? false) || (Boolean(normalizedQuery) && matchedItems.length > 0);
          const hiddenCount = sortedItems.filter((i) => (layout.hiddenHrefs || []).includes(i.href)).length;

          return (
            <div
              key={group.title}
              className="overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
            >
              {/* Group Bar */}
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex flex-col rounded-lg border border-border bg-muted/40">
                    <button
                      type="button"
                      disabled={groupIndex === 0}
                      onClick={() => handleMoveGroup(groupIndex, "up")}
                      className="rounded-t-lg px-1.5 py-0.5 text-muted-foreground transition hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-25"
                      title="Move Module Up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={groupIndex === orderedGroups.length - 1}
                      onClick={() => handleMoveGroup(groupIndex, "down")}
                      className="rounded-b-lg px-1.5 py-0.5 text-muted-foreground transition hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-25"
                      title="Move Module Down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <LayoutGrid className="h-4 w-4" />
                  </div>

                  {isEditing ? (
                    <div className="flex max-w-xs flex-1 items-center gap-1.5">
                      <input
                        type="text"
                        value={customNameInput}
                        onChange={(e) => setCustomNameInput(e.target.value)}
                        placeholder={group.title}
                        className="h-9 w-full rounded-lg border border-primary/50 bg-background px-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameGroup(group.title);
                          if (e.key === "Escape") setEditingGroup(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRenameGroup(group.title)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                        title="Save Name"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-bold text-foreground">{displayTitle}</span>
                      {displayTitle !== group.title && (
                        <span className="hidden shrink-0 text-[11px] font-normal text-muted-foreground sm:inline">
                          ({group.title})
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGroup(group.title);
                          setCustomNameInput(displayTitle);
                        }}
                        className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        title="Rename Module"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {hiddenCount > 0 && (
                    <span className="hidden items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 sm:inline-flex dark:text-amber-400">
                      <EyeOff className="h-3 w-3" />
                      {hiddenCount}
                    </span>
                  )}
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    {sortedItems.length} pages
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleExpand(group.title)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  >
                    Pages
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
                  </button>
                </div>
              </div>

              {/* Group Children Pages */}
              {isExpanded && (
                <div className="space-y-1.5 border-t border-border bg-muted/30 p-3">
                  {matchedItems.map((item: NavItem, itemIdx: number) => {
                    const realIdx = sortedItems.findIndex((i) => i.href === item.href);
                    const isHidden = (layout.hiddenHrefs || []).includes(item.href);
                    return (
                      <div
                        key={`${item.href}-${item.label}-${itemIdx}`}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition",
                          isHidden
                            ? "border-dashed border-border bg-background/40 opacity-60"
                            : "border-border bg-background hover:border-primary/30"
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              disabled={realIdx === 0 || Boolean(normalizedQuery)}
                              onClick={() => handleMoveItem(group.title, realIdx, "up", sortedItems)}
                              className="rounded p-0.5 text-muted-foreground transition hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-25"
                              title={normalizedQuery ? "Clear search to reorder" : "Move Page Up"}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={realIdx === sortedItems.length - 1 || Boolean(normalizedQuery)}
                              onClick={() => handleMoveItem(group.title, realIdx, "down", sortedItems)}
                              className="rounded p-0.5 text-muted-foreground transition hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-25"
                              title={normalizedQuery ? "Clear search to reorder" : "Move Page Down"}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "truncate text-xs font-semibold",
                                  isHidden ? "text-muted-foreground line-through" : "text-foreground"
                                )}
                              >
                                {item.label}
                              </span>
                              {item.badgeSource && (
                                <span className="rounded bg-primary/10 px-1.5 py-px text-[9px] font-bold text-primary">
                                  BADGED
                                </span>
                              )}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">{item.href}</div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleHideItem(item.href)}
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                            isHidden
                              ? "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                              : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                          )}
                          title={isHidden ? "Click to Show in Sidebar" : "Click to Hide from Sidebar"}
                        >
                          {isHidden ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5" />
                              Hidden
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" />
                              Visible
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                  {matchedItems.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">No pages match your search.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "muted" | "amber" | "primary";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "primary"
        ? "text-primary"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="bg-card px-4 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums", toneClass)}>{value}</div>
    </div>
  );
}
