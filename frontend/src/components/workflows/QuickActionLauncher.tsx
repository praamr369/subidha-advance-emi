"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { Bookmark, History, Plus, Star, X } from "lucide-react";

import { workflowsForRole } from "@/config/workflows";
import { getNavigationGroupsForRole, type NavGroup, type NavigationRole } from "@/config/navigation";
import { useWorkflowLauncher } from "@/components/workflows/WorkflowProvider";
import ModalShell from "@/components/ui/ModalShell";
import { cn } from "@/lib/utils";
import {
  readFavoritesSnapshot,
  readRecentsSnapshot,
  subscribeWorkspacePrefs,
  toggleFavorite,
} from "@/lib/workspace-prefs";

type LaunchItem =
  | {
      kind: "workflow";
      id: string;
      label: string;
      description: string;
      canonicalHref: string;
      surface: "drawer" | "route";
    }
  | {
      kind: "nav";
      label: string;
      description: string;
      href: string;
      groupTitle: string;
    };

function flattenNav(groups: NavGroup[]): LaunchItem[] {
  const items: LaunchItem[] = [];
  groups.forEach((group) => {
    const visit = (item: NavGroup["items"][number], parents: string[]) => {
      if (item.hidden || item.disabled) return;
      const href = item.href?.trim();
      if (!href) return;
      items.push({
        kind: "nav",
        label: item.label,
        description: item.description ?? [...parents, group.title].join(" / "),
        href,
        groupTitle: group.title,
      });
      item.children?.forEach((child) => visit(child, [...parents, item.label]));
    };

    group.items.forEach((item) => {
      visit(item, []);
    });
  });
  return items;
}

export default function QuickActionLauncher({
  open,
  onClose,
  role,
  sessionId,
  currentPathname,
}: {
  open: boolean;
  onClose: () => void;
  role: NavigationRole;
  sessionId: number | null;
  currentPathname: string;
}) {
  const { openWorkflow } = useWorkflowLauncher();
  const workflows = useMemo(() => workflowsForRole(role), [role]);
  const favoritesSnapshot = useSyncExternalStore(
    subscribeWorkspacePrefs,
    () => (sessionId ? readFavoritesSnapshot(sessionId, role) : "[]"),
    () => "[]"
  );
  const favorites = useMemo(() => {
    if (!sessionId) return [];
    return JSON.parse(favoritesSnapshot) as string[];
  }, [favoritesSnapshot, sessionId]);

  const navGroups = useMemo(() => getNavigationGroupsForRole(role), [role]);
  const navItems = useMemo(() => flattenNav(navGroups), [navGroups]);

  const workflowItems = useMemo<LaunchItem[]>(
    () =>
      workflows.map((workflow) => ({
        kind: "workflow",
        id: workflow.id,
        label: workflow.label,
        description: workflow.description,
        canonicalHref: workflow.canonicalHref,
        surface: workflow.surface,
      })),
    [workflows]
  );

  const allItems = useMemo(() => [...workflowItems, ...navItems], [navItems, workflowItems]);
  const indexByHref = useMemo(() => new Map(allItems.map((item) => [item.kind === "workflow" ? item.canonicalHref : item.href, item])), [allItems]);

  const recentsSnapshot = useSyncExternalStore(
    subscribeWorkspacePrefs,
    () => (sessionId ? readRecentsSnapshot(sessionId, role) : "[]"),
    () => "[]"
  );
  const recents = useMemo(() => {
    if (!sessionId) return [];
    return JSON.parse(recentsSnapshot) as string[];
  }, [recentsSnapshot, sessionId]);

  const favoriteItems = useMemo(() => {
    if (!sessionId) return [];
    const resolved = favorites.map((href) => indexByHref.get(href)).filter(Boolean) as LaunchItem[];
    return resolved.slice(0, 8);
  }, [favorites, indexByHref, sessionId]);

  const recentItems = useMemo(() => {
    if (!sessionId) return [];
    const resolved = recents.map((href) => indexByHref.get(href)).filter(Boolean) as LaunchItem[];
    return resolved.filter((item) => {
      const href = item.kind === "workflow" ? item.canonicalHref : item.href;
      return href !== currentPathname;
    }).slice(0, 8);
  }, [currentPathname, recents, indexByHref, sessionId]);

  const isCurrentFavorite = useMemo(() => favorites.includes(currentPathname), [favorites, currentPathname]);

  function handleToggleFavorite(href: string) {
    if (!sessionId) return;
    toggleFavorite(sessionId, role, href);
  }

  if (!open) return null;

  return (
    <ModalShell open={open} onClose={onClose} title="Quick actions" align="right" panelClassName="max-w-lg">
      <div className="flex max-h-[calc(100dvh-1.5rem)] min-h-0 flex-col sm:max-h-[calc(100dvh-3rem)]">
        <div className="workflow-panel-header flex items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-[var(--surface-strong)] text-foreground">
              <Plus className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-foreground">Quick actions</div>
              <div className="text-xs text-muted-foreground">Drawer-first for short workflows. Canonical pages stay available.</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sessionId ? (
              <button
                type="button"
                onClick={() => handleToggleFavorite(currentPathname)}
                className={cn(
                  "popup-control inline-flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground transition hover:text-foreground",
                  isCurrentFavorite ? "text-amber-700" : ""
                )}
                aria-label={isCurrentFavorite ? "Remove this page from favorites" : "Favorite this page"}
                title={isCurrentFavorite ? "Favorited" : "Add to favorites"}
              >
                <Star className={cn("h-5 w-5", isCurrentFavorite ? "fill-amber-400 text-amber-700" : "")} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="popup-control inline-flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground transition hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="workflow-panel-body workflow-scroll-area min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {sessionId && favoriteItems.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Bookmark className="h-4 w-4" />
                Favorites
              </div>
              <div className="grid gap-2">
                {favoriteItems.map((item) => {
                  const href = item.kind === "workflow" ? item.canonicalHref : item.href;
                  return (
                    <div key={`fav-${href}`} className="group flex items-start gap-2">
                      <Link
                        href={href}
                        onClick={onClose}
                        className="flex min-w-0 flex-1 items-start gap-3 rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
                      >
                        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border bg-[var(--surface-strong)] text-foreground">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-700" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">{item.label}</span>
                          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {item.description}
                          </span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-[var(--surface-card-elevated)] text-muted-foreground opacity-100 transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] md:opacity-0 md:group-hover:opacity-100"
                        onClick={() => handleToggleFavorite(href)}
                        aria-label="Remove from favorites"
                        title="Remove from favorites"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {sessionId && recentItems.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <History className="h-4 w-4" />
                Recent
              </div>
              <div className="grid gap-2">
                {recentItems.map((item) => {
                  const href = item.kind === "workflow" ? item.canonicalHref : item.href;
                  return (
                    <Link
                      key={`recent-${href}`}
                      href={href}
                      onClick={onClose}
                      className="flex items-start gap-3 rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
                    >
                      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border bg-[var(--surface-strong)] text-foreground">
                        <History className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{item.label}</span>
                        <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {item.kind === "workflow" ? item.description : item.description}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Workflows
            </div>
            <div className="space-y-2">
              {workflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className="rounded-[1.35rem] border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{workflow.label}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{workflow.description}</div>
                    {workflow.safetyNote ? (
                      <div className="mt-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-900">
                        {workflow.safetyNote}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        openWorkflow(workflow.id);
                      }}
                      className={cn(
                        "inline-flex h-10 items-center justify-center rounded-xl border border-primary/80 bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_18px_34px_-24px_rgba(30,64,175,0.62)] transition hover:bg-[color-mix(in_oklab,var(--primary)_90%,black_10%)]"
                      )}
                    >
                      Open
                    </button>
                    <Link
                      href={workflow.canonicalHref}
                      onClick={onClose}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-[var(--surface-strong)] px-4 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
                    >
                      Canonical page
                    </Link>
                  </div>
                </div>
              ))}

              {workflows.length === 0 ? (
                <div className="rounded-[1.35rem] border border-border bg-[var(--surface-muted)] px-4 py-3 text-sm text-muted-foreground">
                  No quick workflows are configured for this role.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </ModalShell>
  );
}
