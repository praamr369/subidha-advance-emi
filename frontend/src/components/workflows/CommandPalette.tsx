"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { Bookmark, Command as CommandIcon, CornerDownLeft, History, Search, Star, X } from "lucide-react";

import { ADMIN_ROUTE_REGISTRY } from "@/config/admin-route-registry";
import { getNavigationGroupsForRole, type NavGroup, type NavigationRole } from "@/config/navigation";
import { workflowsForRole, type WorkflowDefinition, type WorkflowId } from "@/config/workflows";
import { useWorkflowLauncher } from "@/components/workflows/WorkflowProvider";
import ModalShell from "@/components/ui/ModalShell";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { lookupAdminRouteRegistry } from "@/lib/admin-route-registry-lookup";
import { searchAdminGlobal, type AdminGlobalSearchResult } from "@/services/admin-erp";
import {
  readFavoritesSnapshot,
  readRecentsSnapshot,
  subscribeWorkspacePrefs,
  toggleFavorite,
} from "@/lib/workspace-prefs";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  role: NavigationRole;
  sessionId: number | null;
  currentPathname: string;
};

type PaletteItem =
  | {
      kind: "workflow";
      id: WorkflowId;
      label: string;
      description: string;
      href: string;
      surface: WorkflowDefinition["surface"];
    }
  | {
      kind: "nav";
      label: string;
      description: string;
      href: string;
      groupTitle: string;
    }
  | {
      kind: "global";
      label: string;
      description: string;
      href: string;
      type: string;
      status: string;
    };

function flattenNav(groups: NavGroup[]): PaletteItem[] {
  const items: PaletteItem[] = [];
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

function normalizeQuery(value: string) {
  return value.trim().toLowerCase();
}

function isConcreteHref(href: string): boolean {
  return Boolean(href.trim()) && !href.includes("[") && !href.includes("]");
}

function adminRegistryPaletteItems(): PaletteItem[] {
  return ADMIN_ROUTE_REGISTRY.filter((row) => row.status !== "deferred" && isConcreteHref(row.href)).map((row) => ({
    kind: "nav",
    label: row.label,
    description: row.description || row.group,
    href: row.href,
    groupTitle: row.group,
  }));
}

function uniqueByKindHrefLabel(items: PaletteItem[]): PaletteItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.href}:${item.label.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function wrapPaletteRowHover(params: {
  role: NavigationRole;
  item: PaletteItem;
  href: string;
  trigger: ReactElement;
}): ReactElement {
  const { role, item, href, trigger } = params;

  if (item.kind === "global") {
    return (
      <HoverCard openDelay={160}>
        <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
        <HoverCardContent className="w-80" side="left" align="start">
          <div className="text-sm font-semibold text-foreground">{item.label}</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {item.type}
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              {item.status || "Open"}
            </span>
          </div>
          <div className="mt-2 truncate text-[11px] font-medium text-muted-foreground">{href}</div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  if (role === "ADMIN" && (item.kind === "nav" || item.kind === "workflow")) {
    const registryMatch = lookupAdminRouteRegistry(href);
    if (!registryMatch) {
      return trigger;
    }
    return (
      <HoverCard openDelay={180}>
        <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
        <HoverCardContent className="w-80" side="left" align="start">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{registryMatch.group}</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{registryMatch.label}</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{registryMatch.description}</p>
          {registryMatch.status === "deferred" ? (
            <div className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              Deferred in registry
            </div>
          ) : null}
        </HoverCardContent>
      </HoverCard>
    );
  }

  return trigger;
}

function shouldIgnoreShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export default function CommandPalette({ open, onClose, role, sessionId, currentPathname }: CommandPaletteProps) {
  const { openWorkflow } = useWorkflowLauncher();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [globalResults, setGlobalResults] = useState<AdminGlobalSearchResult[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const favoritesSnapshot = useSyncExternalStore(
    subscribeWorkspacePrefs,
    () => (sessionId ? readFavoritesSnapshot(sessionId, role) : "[]"),
    () => "[]"
  );
  const favorites = useMemo(() => {
    if (!sessionId) return [];
    return JSON.parse(favoritesSnapshot) as string[];
  }, [favoritesSnapshot, sessionId]);

  const recentsSnapshot = useSyncExternalStore(
    subscribeWorkspacePrefs,
    () => (sessionId ? readRecentsSnapshot(sessionId, role) : "[]"),
    () => "[]"
  );
  const recents = useMemo(() => {
    if (!sessionId) return [];
    return JSON.parse(recentsSnapshot) as string[];
  }, [recentsSnapshot, sessionId]);

  const navGroups = useMemo(() => getNavigationGroupsForRole(role), [role]);
  const navItems = useMemo(() => flattenNav(navGroups), [navGroups]);
  const registryItems = useMemo<PaletteItem[]>(() => (role === "ADMIN" ? adminRegistryPaletteItems() : []), [role]);
  const workflows = useMemo(() => workflowsForRole(role), [role]);

  const workflowItems = useMemo<PaletteItem[]>(
    () =>
      workflows.map((workflow) => ({
        kind: "workflow",
        id: workflow.id,
        label: workflow.label,
        description: workflow.description,
        href: workflow.canonicalHref,
        surface: workflow.surface,
      })),
    [workflows]
  );

  const allItems = useMemo(() => [...workflowItems, ...navItems], [navItems, workflowItems]);
  const indexItems = useMemo(() => uniqueByKindHrefLabel([...allItems, ...registryItems]), [allItems, registryItems]);
  const indexByHref = useMemo(() => new Map(indexItems.map((item) => [item.href, item])), [indexItems]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleShortcut = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcutTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onClose, open]);

  const normalized = normalizeQuery(query);
  const canSearchGlobal = role === "ADMIN" && normalized.length >= 2;
  useEffect(() => {
    if (!canSearchGlobal) return;

    let active = true;
    const timer = window.setTimeout(() => {
      setGlobalLoading(true);
      void searchAdminGlobal(normalized)
        .then((payload) => {
          if (!active) return;
          setGlobalResults(payload.results ?? []);
        })
        .catch(() => {
          if (!active) return;
          setGlobalResults([]);
        })
        .finally(() => {
          if (active) setGlobalLoading(false);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canSearchGlobal, normalized]);

  const matches = useMemo(() => {
    if (!normalized) return allItems;
    return allItems.filter((item) => {
      const haystack = `${item.label} ${item.description} ${item.href}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [allItems, normalized]);
  const registryMatches = useMemo(() => {
    if (!normalized) return [];
    const visibleKeys = new Set(matches.map((item) => `${item.href}:${item.label.toLowerCase()}`));
    return registryItems.filter((item) => {
      const key = `${item.href}:${item.label.toLowerCase()}`;
      if (visibleKeys.has(key)) return false;
      const haystack = `${item.label} ${item.description} ${item.href} ${item.kind === "nav" ? item.groupTitle : ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [matches, normalized, registryItems]);
  const globalMatches = useMemo<PaletteItem[]>(
    () =>
      globalResults.map((result) => ({
        kind: "global",
        label: result.title,
        description: result.subtitle,
        href: result.deep_link,
        type: result.type,
        status: result.status,
      })),
    [globalResults]
  );
  const displayedMatches = useMemo(() => {
    if (!normalized) return matches;
    return uniqueByKindHrefLabel([...(canSearchGlobal ? globalMatches : []), ...matches, ...registryMatches]);
  }, [canSearchGlobal, globalMatches, matches, normalized, registryMatches]);

  const favoriteItems = useMemo(
    () =>
      favorites
        .map((href) => indexByHref.get(href))
        .filter((value): value is PaletteItem => Boolean(value)),
    [favorites, indexByHref]
  );

  const recentItems = useMemo(
    () =>
      recents
        .map((href) => indexByHref.get(href))
        .filter((value): value is PaletteItem => Boolean(value))
        .filter((item) => item.href !== currentPathname),
    [currentPathname, indexByHref, recents]
  );

  function handleToggleFavorite(href: string) {
    if (!sessionId) return;
    toggleFavorite(sessionId, role, href);
  }

  function renderRow(item: PaletteItem) {
    const isFavorite = favorites.includes(item.href);
    const RowIcon = item.kind === "workflow" ? CommandIcon : Search;
    const rowContent = (
      <>
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border bg-[var(--surface-strong)] text-foreground">
          <RowIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-semibold text-foreground">{item.label}</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <CornerDownLeft className="h-3.5 w-3.5" />
              Enter
            </span>
          </span>
          <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</span>
          {item.kind === "global" ? (
            <span className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {item.type}
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                {item.status || "Open"}
              </span>
            </span>
          ) : null}
          <span className="mt-2 block truncate text-[11px] font-medium text-muted-foreground">{item.href}</span>
        </span>
      </>
    );

    const rowActionClassName = cn(
      "group flex min-w-0 flex-1 items-start gap-3 rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
    );

    if (item.kind === "workflow") {
      const workflowTrigger = (
        <button
          type="button"
          onClick={() => {
            onClose();
            openWorkflow(item.id, { query: undefined });
          }}
          className={cn(rowActionClassName, "text-left")}
        >
          {rowContent}
        </button>
      );
      const workflowRow = wrapPaletteRowHover({
        role,
        item,
        href: item.href,
        trigger: workflowTrigger,
      });
      return (
        <div key={`${item.kind}:${item.id}`} className="flex items-start gap-2">
          {workflowRow}
          {sessionId ? (
            <button
              type="button"
              onClick={() => handleToggleFavorite(item.href)}
              className={cn(
                "mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-[var(--surface-card-elevated)] text-muted-foreground transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]",
                isFavorite ? "text-amber-700" : ""
              )}
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              title={isFavorite ? "Favorited" : "Favorite"}
            >
              <Star className={cn("h-4 w-4", isFavorite ? "fill-amber-400 text-amber-700" : "")} />
            </button>
          ) : null}
        </div>
      );
    }

    const linkTrigger = (
      <Link
        href={item.href}
        onClick={onClose}
        className={rowActionClassName}
        aria-label={item.href.includes("workflow=direct-sale") ? "Retail receivable collection" : undefined}
      >
        {rowContent}
      </Link>
    );
    const linkRow = wrapPaletteRowHover({
      role,
      item,
      href: item.href,
      trigger: linkTrigger,
    });
    return (
      <div key={`${item.kind}:${item.href}:${item.label}`} className="flex items-start gap-2">
        {linkRow}
        {sessionId ? (
          <button
            type="button"
            onClick={() => handleToggleFavorite(item.href)}
            className={cn(
              "mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-[var(--surface-card-elevated)] text-muted-foreground transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]",
              isFavorite ? "text-amber-700" : ""
            )}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            title={isFavorite ? "Favorited" : "Favorite"}
          >
            <Star className={cn("h-4 w-4", isFavorite ? "fill-amber-400 text-amber-700" : "")} />
          </button>
        ) : null}
      </div>
    );
  }

  if (!open) return null;

  return (
    <ModalShell open={open} onClose={onClose} title="Command palette" align="center" panelClassName="max-w-3xl">
      <div className="flex max-h-[calc(100dvh-1.5rem)] min-h-0 flex-col sm:max-h-[calc(100dvh-3rem)]">
        <div className="workflow-panel-header flex items-center gap-3 px-5 py-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-[var(--surface-strong)]">
            <CommandIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">Command palette</div>
            <div className="text-xs text-muted-foreground">Search workflows, modules, and registers.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="popup-control inline-flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground transition hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="workflow-panel-header border-t-0 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[280px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search operations, registers, workflows…"
                aria-describedby="command-palette-search-hint"
                className="h-11 w-full rounded-2xl border border-border bg-[var(--surface-card-elevated)] pl-10 pr-[7.25rem] text-sm font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
              />
              <span
                id="command-palette-search-hint"
                className="pointer-events-none absolute right-3 top-1/2 hidden max-w-[10rem] -translate-y-1/2 text-right text-[10px] leading-tight text-muted-foreground sm:block"
              >
                {role === "ADMIN"
                  ? "Type 2+ letters to merge global ERP hits."
                  : "Typing filters this palette list."}
              </span>
            </div>
            <div className="popup-control inline-flex flex-wrap items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold text-muted-foreground">
              <CommandIcon className="h-4 w-4 shrink-0" />
              <span className="inline-flex items-center gap-1">
                <Kbd>Ctrl</Kbd>
                <span className="text-[10px] font-normal text-muted-foreground">/</span>
                <Kbd className="min-w-[26px] px-2">⌘</Kbd>
                <span className="text-muted-foreground">+</span>
                <Kbd>K</Kbd>
                <span className="sr-only">Ctrl K</span>
              </span>
            </div>
          </div>
        </div>

        <div className="workflow-panel-body workflow-scroll-area min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {!normalized && favoriteItems.length > 0 ? (
            <section className="mb-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Bookmark className="h-4 w-4" />
                Favorites
              </div>
              <div className="grid gap-2">{favoriteItems.slice(0, 6).map(renderRow)}</div>
            </section>
          ) : null}

          {!normalized && recentItems.length > 0 ? (
            <section className="mb-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <History className="h-4 w-4" />
                Recent
              </div>
              <div className="grid gap-2">{recentItems.slice(0, 6).map(renderRow)}</div>
            </section>
          ) : null}

          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <CommandIcon className="h-4 w-4" />
              Results
            </div>
            {canSearchGlobal && globalLoading ? (
              <div className="mb-2 rounded-2xl border border-border bg-[var(--surface-muted)] px-4 py-3 text-sm text-muted-foreground">
                Searching customers, subscriptions, invoices, receipts, products, partners, and payments…
              </div>
            ) : null}
            {displayedMatches.length === 0 ? (
              <div className="rounded-2xl border border-border bg-[var(--surface-muted)] px-4 py-3 text-sm text-muted-foreground">
                No matches for &quot;{query.trim()}&quot;.
              </div>
            ) : (
              <div className="grid gap-2">{displayedMatches.slice(0, 20).map(renderRow)}</div>
            )}
          </section>
        </div>
      </div>
    </ModalShell>
  );
}
