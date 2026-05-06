// frontend/src/components/layout/DashboardShell.tsx
"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  Fragment,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  BellRing,
  Boxes,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Factory,
  GaugeCircle,
  Handshake,
  Home,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Ticket,
  Trophy,
  Truck,
  UserCircle2,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";

import NotificationBellDropdown from "@/components/layout/NotificationBellDropdown";
import PortalHeader from "@/components/layout/PortalHeader";
import PortalShell from "@/components/layout/PortalShell";
import RoleSidebar from "@/components/layout/RoleSidebar";
import BusinessSetupWorkflowBanner from "@/components/admin/business-setup/BusinessSetupWorkflowBanner";
import WorkflowProvider from "@/components/workflows/WorkflowProvider";
import AdminWorkspaceMenubar from "@/components/layout/AdminWorkspaceMenubar";
import CommandPalette from "@/components/workflows/CommandPalette";
import QuickActionLauncher from "@/components/workflows/QuickActionLauncher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getStoredSession } from "@/lib/auth/session";
import { useLogout } from "@/hooks/useLogout";
import { ROUTES } from "@/lib/routes";
import { brandConfig } from "@/config/brand";
import {
  getNavigationGroupsForRole,
  normalizeRole,
  type NavGroup,
  type NavIconKey,
  type NavigationRole,
} from "@/config/navigation";
import { pushRecent, readFavorites, toggleFavorite } from "@/lib/workspace-prefs";
import { initialsFromDisplayName } from "@/lib/display-name";
import { cn } from "@/lib/utils";
import { getAdminOperationsQueueSummary } from "@/services/phase5-control";

const DashboardShellContext = createContext(false);

type DashboardShellProps = {
  children: ReactNode;
};

type ShellNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  badgeSource?: string;
  children?: ShellNavItem[];
};

type ShellNavGroup = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: ShellNavItem[];
};

const ICON_MAP: Record<NavIconKey, React.ComponentType<{ className?: string }>> = {
  operations: GaugeCircle,
  crm: Handshake,
  billing: ReceiptText,
  inventory: Boxes,
  procurement: ShoppingCart,
  manufacturing: Factory,
  serviceDesk: LifeBuoy,
  accounting: Landmark,
  payroll: UserCog,
  branches: Building2,
  governance: ShieldCheck,
  reminders: BellRing,
  cashCounter: CircleDollarSign,
  dashboard: LayoutDashboard,
  analytics: BarChart3,
  home: Home,
  customers: Users,
  deliveries: Truck,
  leads: Search,
  products: Boxes,
  subscriptions: ClipboardList,
  payments: CreditCard,
  emis: Receipt,
  collections: Wallet,
  batches: Package,
  partners: Users,
  finance: Landmark,
  reconciliation: ShieldCheck,
  commissions: Wallet,
  settledCommissions: CreditCard,
  payoutBatches: ReceiptText,
  luckyIds: Ticket,
  luckyDraws: Trophy,
  reports: BarChart3,
  settings: Settings,
  auditLogs: ShieldCheck,
  profile: UserCircle2,
  support: LifeBuoy,
  collectPayment: CircleDollarSign,
};

const SIDEBAR_COLLAPSED_LEGACY_KEY = "subidha:dashboard-sidebar-collapsed:v1";
const SIDEBAR_GROUPS_KEY = "subidha:dashboard-sidebar-groups:v1";
const OPERATOR_MODE_KEY = "subidha:operator-mode:v1";
/** Browser-local layout preference only (max width of dashboard content stage). Not financial data. */
const WORKSPACE_WIDTH_PRESET_KEY = "subidha:workspace-width-preset:v1";
const WORKSPACE_WIDTH_CSS_VALUES = ["1380px", "1580px", "1800px"] as const;
const WORKSPACE_WIDTH_PRESET_LABELS = ["Compact", "Balanced", "Spacious"] as const;
const DASHBOARD_SHELL_EVENT = "subidha:dashboard-shell";
type OperatorMode = "SIMPLE" | "ADVANCED";

function sidebarCollapsedKey(sessionId: number | null, role: NavigationRole) {
  if (!sessionId) return SIDEBAR_COLLAPSED_LEGACY_KEY;
  return `subidha:dashboard-sidebar-collapsed:v2:${sessionId}:${role}`;
}

function readBooleanSetting(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
}

function subscribeDashboardShell(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener("storage", callback);
  window.addEventListener("subidha:session", callback);
  window.addEventListener(DASHBOARD_SHELL_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("subidha:session", callback);
    window.removeEventListener(DASHBOARD_SHELL_EVENT, callback);
  };
}

function notifyDashboardShellChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DASHBOARD_SHELL_EVENT));
}

function readSessionSnapshot() {
  return JSON.stringify(getStoredSession());
}

function parseSessionSnapshot(snapshot: string): ReturnType<typeof getStoredSession> {
  try {
    return JSON.parse(snapshot) as ReturnType<typeof getStoredSession>;
  } catch {
    return null;
  }
}

function readExpandedGroups(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SIDEBAR_GROUPS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readOperatorMode(): OperatorMode {
  if (typeof window === "undefined") return "SIMPLE";
  try {
    const raw = window.localStorage.getItem(OPERATOR_MODE_KEY);
    return raw === "ADVANCED" ? "ADVANCED" : "SIMPLE";
  } catch {
    return "SIMPLE";
  }
}

function readWorkspaceWidthPresetSnapshot(): string {
  if (typeof window === "undefined") return "2";
  try {
    const raw = window.localStorage.getItem(WORKSPACE_WIDTH_PRESET_KEY);
    if (raw === null) return "2";
    const n = Number.parseInt(raw, 10);
    if (n === 0 || n === 1 || n === 2) return String(n);
    return "2";
  } catch {
    return "2";
  }
}

function clampWorkspaceWidthPreset(value: number): 0 | 1 | 2 {
  if (value === 0 || value === 1 || value === 2) return value;
  return 2;
}

function segmentToLabel(segment: string) {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildPageTitle(pathname: string) {
  if (pathname === "/admin/counters") return "Counter & Cash Desk Master";
  if (pathname === "/admin/inventory/stock-needs") return "Stock needs";
  const cleaned = pathname.replace(/^\/+|\/+$/g, "");
  const segments = cleaned.split("/").filter(Boolean);
  if (segments.length === 0) return "Dashboard";
  const last = segments[segments.length - 1];
  if (/^\d+$/.test(last)) {
    const prev = segments[segments.length - 2] ?? "Details";
    return `${segmentToLabel(prev)} Details`;
  }
  return segmentToLabel(last);
}

function hrefPathname(href: string) {
  return href.split("?")[0] || href;
}

function isActivePath(pathname: string, currentUrl: string, href: string) {
  const cleanHref = hrefPathname(href);
  if (href.includes("?")) {
    if (currentUrl === href || currentUrl.startsWith(`${href}&`)) return true;
  } else if (cleanHref === pathname) {
    return true;
  }
  if (
    cleanHref === ROUTES.admin.dashboard ||
    cleanHref === ROUTES.partner.dashboard ||
    cleanHref === ROUTES.customer.dashboard ||
    cleanHref === ROUTES.cashier.dashboard
  ) {
    return false;
  }
  return pathname.startsWith(`${cleanHref}/`);
}

function getRoleBasePath(role: NavigationRole) {
  switch (role) {
    case "ADMIN":
      return ROUTES.admin.root;
    case "PARTNER":
      return ROUTES.partner.root;
    case "CUSTOMER":
      return ROUTES.customer.root;
    case "CASHIER":
      return ROUTES.cashier.root;
    default:
      return ROUTES.public.home;
  }
}

function mapNavGroups(groups: NavGroup[]): ShellNavGroup[] {
  const mapItem = (item: NavGroup["items"][number]): ShellNavItem => ({
    label: item.label,
    href: item.href,
    icon: ICON_MAP[item.icon],
    disabled: Boolean(item.disabled),
    badgeSource: item.badgeSource,
    children: item.children
      ?.filter((child) => !child.hidden && typeof child.href === "string" && child.href.trim().length > 0)
      .map(mapItem),
  });

  return groups
    .map((group) => ({
      title: group.title,
      icon: ICON_MAP[group.icon ?? group.items[0]?.icon ?? "dashboard"],
      items: group.items
        .filter((item) => !item.hidden && typeof item.href === "string" && item.href.trim().length > 0)
        .map(mapItem),
    }))
    .filter((group) => group.items.length > 0);
}

function flattenShellItems(items: ShellNavItem[]): ShellNavItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flattenShellItems(item.children) : [])]);
}

function filterShellItems(items: ShellNavItem[], query: string): ShellNavItem[] {
  const matches: ShellNavItem[] = [];
  for (const item of items) {
    const selfMatch = item.label.toLowerCase().includes(query) || item.href.toLowerCase().includes(query);
    const children = item.children ? filterShellItems(item.children, query) : undefined;
    if (selfMatch || (children && children.length > 0)) {
      matches.push({ ...item, children });
    }
  }
  return matches;
}

function formatRoleLabel(role: NavigationRole) {
  if (role === "ADMIN") return "Admin";
  if (role === "PARTNER") return "Partner";
  if (role === "CUSTOMER") return "Customer";
  if (role === "CASHIER") return "Cashier";
  return "Workspace";
}

function getProfileHref(role: NavigationRole) {
  switch (role) {
    case "CUSTOMER":
      return ROUTES.customer.profile;
    case "ADMIN":
      return ROUTES.admin.settings;
    default:
      return getRoleBasePath(role);
  }
}

function getSettingsHref(role: NavigationRole) {
  switch (role) {
    case "ADMIN":
      return ROUTES.admin.settings;
    case "CUSTOMER":
      return ROUTES.customer.profile;
    default:
      return getRoleBasePath(role);
  }
}

function RailTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 rounded-md border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface)_92%,black_8%)] px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block group-focus-within:block">
      {label}
    </span>
  );
}

function UserDropdown({
  displayName,
  role,
  onLogout,
  isLoggingOut,
}: {
  displayName: string;
  role: NavigationRole;
  onLogout: () => void;
  isLoggingOut: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileHref = getProfileHref(role);
  const settingsHref = getSettingsHref(role);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--topbar-border)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--topbar-control)_96%,white_4%),color-mix(in_oklab,var(--topbar-control)_84%,var(--surface-muted)_16%))] px-2.5 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_14px_34px_-30px_rgba(15,23,42,0.5)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
      >
        <Avatar className="size-8 rounded-lg border-[var(--surface-border-strong)]">
          <AvatarFallback className="rounded-lg">{initialsFromDisplayName(displayName)}</AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[150px] truncate text-sm font-semibold text-foreground">{displayName}</span>
          <span className="block text-[11px] text-muted-foreground">{formatRoleLabel(role)}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {isOpen ? (
        <div className="surface-glass absolute right-0 z-50 mt-2 w-56 animate-in fade-in-0 zoom-in-95 rounded-2xl p-2 duration-100">
          <div className="flex items-center gap-3 border-b border-border px-3 py-2">
            <Avatar className="size-9 shrink-0 rounded-xl border-[var(--surface-border-strong)]">
              <AvatarFallback className="rounded-xl">{initialsFromDisplayName(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
              <div className="text-xs text-muted-foreground">{formatRoleLabel(role)}</div>
            </div>
          </div>
          <Link
            href={profileHref}
            className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition hover:bg-[var(--surface-muted)]"
            onClick={() => setIsOpen(false)}
          >
            <UserCircle2 className="h-4 w-4" />
            Profile
          </Link>
          <Link
            href={settingsHref}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition hover:bg-[var(--surface-muted)]"
            onClick={() => setIsOpen(false)}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onLogout();
            }}
            disabled={isLoggingOut}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SidebarContent({
  role,
  pathname,
  displayName,
  sessionId,
  onLogout,
  isLoggingOut,
  collapsed,
  onToggleCollapse,
  onClose,
  workspaceWidthPreset,
  onWorkspaceWidthPresetChange,
}: {
  role: NavigationRole;
  pathname: string;
  displayName: string;
  sessionId: number | null;
  onLogout: () => void;
  isLoggingOut: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose?: () => void;
  workspaceWidthPreset: 0 | 1 | 2;
  onWorkspaceWidthPresetChange: (preset: 0 | 1 | 2) => void;
}) {
  const isMobile = typeof onClose === "function";
  const searchParams = useSearchParams();
  const navGroups = useMemo(() => mapNavGroups(getNavigationGroupsForRole(role)), [role]);
  const currentUrl = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const activeHref = useMemo(() => {
    const matches = navGroups
      .flatMap((group) => flattenShellItems(group.items))
      .filter((item) => isActivePath(pathname, currentUrl, item.href))
      .sort((left, right) => right.href.length - left.href.length);
    return matches[0]?.href ?? null;
  }, [currentUrl, navGroups, pathname]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => readExpandedGroups());
  const [flyoutGroup, setFlyoutGroup] = useState<string | null>(null);
  const [navQuery, setNavQuery] = useState("");
  const normalizedNavQuery = navQuery.trim().toLowerCase();
  const [favorites, setFavorites] = useState<string[]>(() => (sessionId ? readFavorites(sessionId, role) : []));
  const [queueBadges, setQueueBadges] = useState<Record<string, number>>({});
  const [operatorMode, setOperatorMode] = useState<OperatorMode>(() =>
    role === "ADMIN" ? readOperatorMode() : "ADVANCED"
  );
  const persistOperatorMode = useCallback((value: OperatorMode) => {
    setOperatorMode(value);
    try {
      window.localStorage.setItem(OPERATOR_MODE_KEY, value);
    } catch {
      // preference-only
    }
    notifyDashboardShellChanged();
  }, []);

  const favoriteLinks = useMemo(() => {
    if (favorites.length === 0) return [];
    const allItems = navGroups.flatMap((group) => flattenShellItems(group.items));
    return favorites
      .map((href) => allItems.find((item) => item.href === href))
      .filter((item): item is ShellNavItem => Boolean(item))
      .slice(0, 6);
  }, [favorites, navGroups]);

  const modeFilteredGroups = useMemo(() => {
    if (role !== "ADMIN" || operatorMode !== "SIMPLE") return navGroups;
    const allowedGroupTitles = new Set([
      "Command Center",
      "Staff & Business Setup",
      "CRM",
      "Sales",
      "Subscriptions",
      "Product & Inventory",
      "Delivery & Returns",
      "Finance & Accounting",
    ]);
    const simpleFinanceAllowed = new Set([
      "Finance Workspace",
      "Collections",
      "Dues",
      "Overdue",
      "Payment Collection",
      "Reconciliation",
      "Deposits",
    ]);
    return navGroups
      .filter((group) => allowedGroupTitles.has(group.title))
      .map((group) => {
        if (group.title !== "Finance & Accounting") return group;
        return {
          ...group,
          items: group.items.filter((item) => simpleFinanceAllowed.has(item.label)),
        };
      })
      .filter((group) => group.items.length > 0);
  }, [navGroups, operatorMode, role]);

  const visibleGroups = useMemo(() => {
    if (!normalizedNavQuery) return modeFilteredGroups;

    return modeFilteredGroups
      .map((group) => {
        const groupMatch = group.title.toLowerCase().includes(normalizedNavQuery);
        if (groupMatch) return group;
        return {
          ...group,
          items: filterShellItems(group.items, normalizedNavQuery),
        };
      })
      .filter((group) => group.items.length > 0);
  }, [modeFilteredGroups, normalizedNavQuery]);

  useEffect(() => {
    if (role !== "ADMIN") return;
    let cancelled = false;
    const loadBadges = async () => {
      try {
        const payload = (await getAdminOperationsQueueSummary()) as {
          results?: { key: string; badge_source?: string; count: number }[];
        };
        if (cancelled) return;
        const next: Record<string, number> = {};
        (payload.results ?? []).forEach((row) => {
          if (row.badge_source) {
            next[row.badge_source] = Number(row.count || 0);
          }
        });
        setQueueBadges(next);
      } catch {
        if (!cancelled) setQueueBadges({});
      }
    };
    void loadBadges();
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(expandedGroups));
    } catch {
      // Enhancement-only persistence.
    }
  }, [expandedGroups]);

  const toggleGroup = useCallback(
    (title: string, defaultOpen: boolean) => {
      if (collapsed && !isMobile) {
        setFlyoutGroup((current) => (current === title ? null : title));
        return;
      }
      setExpandedGroups((current) => ({
        ...current,
        [title]: !(current[title] ?? defaultOpen),
      }));
    },
    [collapsed, isMobile]
  );

  const toggleNestedItem = useCallback((key: string, defaultOpen: boolean) => {
    setExpandedGroups((current) => ({
      ...current,
      [key]: !(current[key] ?? defaultOpen),
    }));
  }, []);

  const renderBadge = useCallback(
    (item: ShellNavItem) =>
      item.badgeSource && (queueBadges[item.badgeSource] ?? 0) > 0 ? (
        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
          {queueBadges[item.badgeSource]}
        </span>
      ) : null,
    [queueBadges]
  );

  function renderFlyoutItem(groupTitle: string, item: ShellNavItem, depth = 0): ReactNode {
      const active = item.href === activeHref;
      const childActive = item.children?.some((child) =>
        flattenShellItems([child]).some((candidate) => candidate.href === activeHref)
      );
      const Icon = item.icon;
      const classes = cn(
        "group relative flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition",
        depth > 0 ? "ml-3" : "",
        item.disabled
          ? "cursor-not-allowed border-transparent text-[var(--sidebar-item-muted)] opacity-70"
          : active || childActive
            ? "border-[var(--sidebar-item-active-border)] bg-[var(--sidebar-item-active)] text-white"
            : "border-transparent text-[var(--sidebar-item-muted)] hover:border-[var(--sidebar-rail-border)] hover:bg-[var(--sidebar-item-hover)] hover:text-white"
      );

      const key = `${groupTitle}:${item.href}:${item.label}:${depth}`;
      const row = item.disabled ? (
        <div key={key} className={classes} aria-disabled="true" title="Not available yet">
          <Icon className="h-4 w-4 shrink-0 text-[var(--sidebar-item-muted)]" />
          <span className="min-w-0 truncate text-[13px] font-medium">{item.label}</span>
          {renderBadge(item)}
        </div>
      ) : (
        <Link
          key={key}
          href={item.href}
          onClick={isMobile ? onClose : undefined}
          className={classes}
          role="menuitem"
        >
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              active ? "text-[var(--sidebar-primary)]" : "text-[var(--sidebar-item-muted)] group-hover:text-white"
            )}
          />
          <span className="min-w-0 truncate text-[13px] font-medium">{item.label}</span>
          {renderBadge(item)}
        </Link>
      );

      return (
        <div key={key}>
          {row}
          {item.children && item.children.length > 0 ? (
            <div className="mt-1 space-y-1 border-l border-[var(--sidebar-rail-border)]/60 pl-2">
              {item.children.map((child) => renderFlyoutItem(groupTitle, child, depth + 1))}
            </div>
          ) : null}
        </div>
      );
  }

  function renderExpandedItem(groupTitle: string, item: ShellNavItem, depth = 0): ReactNode {
      const active = item.href === activeHref;
      const descendants = item.children ? flattenShellItems(item.children) : [];
      const childActive = descendants.some((child) => child.href === activeHref);
      const hasChildren = Boolean(item.children?.length);
      const itemKey = `${groupTitle}:${item.href}:${item.label}`;
      const defaultOpen = childActive || normalizedNavQuery.length > 0;
      const itemOpen = hasChildren && (childActive || (expandedGroups[itemKey] ?? defaultOpen));
      const Icon = item.icon;
      const rowBase = cn(
        "group/item relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition",
        depth > 0 ? "ml-3" : "",
        active || childActive
          ? "border-[var(--sidebar-item-active-border)] bg-[var(--sidebar-item-active)] text-white"
          : "border-transparent text-[var(--sidebar-item-muted)] hover:border-[var(--sidebar-rail-border)] hover:bg-[var(--sidebar-item-hover)] hover:text-white"
      );

      const rowContent = (
        <>
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              active ? "text-[var(--sidebar-primary)]" : "text-[var(--sidebar-item-muted)] group-hover/item:text-white"
            )}
          />
          <span className="min-w-0 truncate text-[13px] font-semibold">{item.label}</span>
          {renderBadge(item)}
        </>
      );

      const row = item.disabled ? (
        <div className={cn(rowBase, "cursor-not-allowed opacity-70")} aria-disabled="true" title="Not available yet">
          {rowContent}
        </div>
      ) : (
        <div className={rowBase} title={collapsed ? item.label : undefined}>
          <Link
            href={item.href}
            onClick={isMobile ? onClose : undefined}
            className="flex min-w-0 flex-1 items-center gap-2.5"
            aria-label={item.label}
          >
            {rowContent}
          </Link>
          {hasChildren ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleNestedItem(itemKey, defaultOpen);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-[var(--sidebar-item-muted)] transition hover:bg-black/10 hover:text-white"
              aria-label={itemOpen ? `Collapse ${item.label}` : `Expand ${item.label}`}
            >
              {itemOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : sessionId && !collapsed ? (
            <button
              type="button"
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-[var(--sidebar-item-muted)] opacity-0 transition hover:bg-black/10 hover:text-white group-hover/item:opacity-100",
                favorites.includes(item.href) ? "opacity-100 text-amber-200" : ""
              )}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const next = toggleFavorite(sessionId, role, item.href);
                setFavorites(next);
              }}
              aria-label={favorites.includes(item.href) ? "Remove favorite" : "Add favorite"}
              title={favorites.includes(item.href) ? "Favorited" : "Favorite"}
            >
              <Star className={cn("h-3.5 w-3.5", favorites.includes(item.href) ? "fill-amber-400 text-amber-200" : "")} />
            </button>
          ) : null}
        </div>
      );

      return (
        <div key={itemKey} className="space-y-1">
          {row}
          {itemOpen ? (
            <div className="space-y-1 border-l border-[var(--sidebar-rail-border)]/60 pl-2">
              {item.children!.map((child) => renderExpandedItem(groupTitle, child, depth + 1))}
            </div>
          ) : null}
        </div>
      );
  }

  return (
    <div className="flex h-full flex-col" onMouseLeave={() => setFlyoutGroup(null)}>
      <div className="sticky top-0 z-20 border-b border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface)_92%,black_8%)]">
        <div className="flex h-[5rem] items-center gap-3 px-5">
          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--sidebar-item-active-border)] bg-[var(--sidebar-item-active)] text-sm font-semibold text-[var(--sidebar-primary)] shadow-[0_12px_24px_-18px_rgba(15,23,42,0.9)]">
            SF
          </div>

          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">
                {brandConfig.companyName}
              </div>
              <div className="truncate text-lg font-semibold tracking-tight text-white">{brandConfig.platformName}</div>
            </div>
          ) : (
            <span className="sr-only">{brandConfig.platformName}</span>
          )}

          {!isMobile ? (
            <button
              type="button"
              onClick={() => {
                setFlyoutGroup(null);
                onToggleCollapse();
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_70%,transparent)] text-[var(--sidebar-foreground)] transition hover:bg-[var(--sidebar-item-hover)]"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_80%,transparent)] text-[var(--sidebar-foreground)]"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!collapsed ? (
        <div className="border-b border-[var(--sidebar-rail-border)] px-5 py-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_74%,transparent)] px-3.5 py-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">
                {formatRoleLabel(role)} Navigation
              </div>
              <div className="mt-1 text-sm font-semibold text-white">All operational modules are grouped here.</div>
            </div>
            <div className="rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface)_74%,transparent)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--sidebar-section-label)]">
              Live
            </div>
          </div>

          {favoriteLinks.length > 0 ? (
            <div className="mt-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">Favorites</div>
              <div className="mt-2 space-y-1">
                {favoriteLinks.map((item) => (
                  <div
                    key={`fav-${item.href}`}
                    className="group/fav flex items-center justify-between gap-2 rounded-xl border border-transparent px-2.5 py-2 text-xs font-semibold text-[var(--sidebar-item-muted)] transition hover:border-[var(--sidebar-rail-border)] hover:bg-[var(--sidebar-item-hover)] hover:text-white"
                  >
                    <Link
                      href={item.href}
                      onClick={isMobile ? onClose : undefined}
                      className="min-w-0 flex-1 truncate"
                      aria-label={item.label}
                    >
                      {item.label}
                    </Link>
                    {sessionId ? (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-[var(--sidebar-item-muted)] opacity-0 transition hover:bg-black/10 hover:text-white group-hover/fav:opacity-100"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const next = toggleFavorite(sessionId, role, item.href);
                          setFavorites(next);
                        }}
                        aria-label="Remove favorite"
                        title="Remove favorite"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-3.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">Navigate</label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--sidebar-item-muted)]" />
              <input
                type="search"
                value={navQuery}
                onChange={(event) => setNavQuery(event.target.value)}
                placeholder="Filter modules"
                className="h-11 w-full rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_76%,transparent)] pl-10 pr-3 text-sm font-medium text-[var(--sidebar-foreground)] placeholder:text-[var(--sidebar-item-muted)] focus:border-[var(--sidebar-item-active-border)] focus:outline-none focus:ring-2 focus:ring-[var(--sidebar-item-active-border)]/30"
              />
            </div>
          </div>
          {!collapsed ? (
            <div className="mt-3.5 rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_76%,transparent)] px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--sidebar-section-label)]">
                    Workspace width
                  </div>
                  <div className="mt-0.5 text-xs leading-snug text-[var(--sidebar-item-muted)]">
                    Display preference only — how wide the main workspace column appears on this browser.
                  </div>
                </div>
                <span className="shrink-0 pt-0.5 text-[11px] font-semibold tracking-wide text-[var(--sidebar-item-muted)]">
                  {WORKSPACE_WIDTH_PRESET_LABELS[workspaceWidthPreset]}
                </span>
              </div>
              <Slider
                aria-label="Workspace content width"
                data-testid="workspace-width-slider"
                min={0}
                max={2}
                step={1}
                value={[workspaceWidthPreset]}
                onValueChange={(next) => {
                  const step = next[0];
                  if (step === undefined) return;
                  onWorkspaceWidthPresetChange(clampWorkspaceWidthPreset(step));
                }}
                className="mt-3 w-full [&_[data-slot=slider-track]]:bg-white/15 [&_[data-slot=slider-range]]:bg-[var(--sidebar-item-active-border)] [&_[data-slot=slider-thumb]]:border-[var(--sidebar-rail-border)] [&_[data-slot=slider-thumb]]:bg-white"
              />
            </div>
          ) : null}
          {role === "ADMIN" ? (
            <div className="mt-3.5 flex items-center justify-between rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_76%,transparent)] px-3 py-2.5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--sidebar-section-label)]">
                  Operator Mode
                </div>
                <div className="text-xs text-[var(--sidebar-item-muted)]">
                  {operatorMode === "SIMPLE" ? "Simple workflow view" : "Advanced ERP view"}
                </div>
              </div>
              <ToggleGroup
                type="single"
                value={operatorMode}
                data-testid={isMobile ? "operator-mode-toggle-mobile" : "operator-mode-toggle"}
                aria-label={operatorMode === "SIMPLE" ? "Switch Advanced" : "Switch Simple"}
                onValueChange={(value: string) => {
                  if (value !== "SIMPLE" && value !== "ADVANCED") return;
                  persistOperatorMode(value as OperatorMode);
                }}
                onClick={(event) => {
                  if (event.target !== event.currentTarget) return;
                  persistOperatorMode(operatorMode === "SIMPLE" ? "ADVANCED" : "SIMPLE");
                }}
                className="border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_82%,transparent)] p-1"
              >
                <ToggleGroupItem
                  value="SIMPLE"
                  aria-label="Simple workflow view"
                  onClick={() => persistOperatorMode(operatorMode === "SIMPLE" ? "ADVANCED" : "SIMPLE")}
                  className="border-transparent px-3 py-2 text-xs font-semibold text-[var(--sidebar-item-muted)] hover:text-white data-[state=on]:border-[var(--sidebar-rail-border)] data-[state=on]:bg-[var(--sidebar-item-active)] data-[state=on]:text-white"
                >
                  Simple
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="ADVANCED"
                  aria-label="Advanced ERP view"
                  onClick={() => persistOperatorMode("ADVANCED")}
                  className="border-transparent px-3 py-2 text-xs font-semibold text-[var(--sidebar-item-muted)] hover:text-white data-[state=on]:border-[var(--sidebar-rail-border)] data-[state=on]:bg-[var(--sidebar-item-active)] data-[state=on]:text-white"
                >
                  Advanced
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          ) : null}
        </div>
      ) : null}

      <nav className="flex-1 overflow-y-auto px-4 py-5" role="navigation" aria-label={`${formatRoleLabel(role)} sidebar navigation`}>
        <div className="space-y-3">
          {visibleGroups.length === 0 && !collapsed ? (
            <div className="rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_76%,transparent)] px-3 py-3 text-xs text-[var(--sidebar-item-muted)]">
              No navigation matches for &quot;{navQuery.trim()}&quot;.
            </div>
          ) : null}
          {visibleGroups.map((group) => {
            const GroupIcon = group.icon;
            const groupActive = flattenShellItems(group.items).some((item) => item.href === activeHref);
            const defaultOpen = true;
            const groupOpen = !collapsed && (groupActive || (expandedGroups[group.title] ?? defaultOpen));
            const flyoutOpen = collapsed && flyoutGroup === group.title;

            return (
              <section
                key={group.title}
                className="group relative space-y-1"
                onMouseEnter={() => {
                  if (!collapsed) return;
                  setFlyoutGroup(group.title);
                }}
                onFocus={() => {
                  if (!collapsed) return;
                  setFlyoutGroup(group.title);
                }}
                onBlur={(event) => {
                  if (!collapsed) return;
                  const nextTarget = event.relatedTarget as Node | null;
                  if (nextTarget && event.currentTarget.contains(nextTarget)) return;
                  setFlyoutGroup(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setFlyoutGroup(null);
                  }
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title, defaultOpen)}
                  className={cn(
                    "group/nav relative flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition",
                    collapsed ? "justify-center" : "",
                    groupActive
                      ? "border-[var(--sidebar-item-active-border)] bg-[var(--sidebar-item-active)] text-white"
                      : "border-transparent text-[var(--sidebar-item-muted)] hover:border-[var(--sidebar-rail-border)] hover:bg-[var(--sidebar-item-hover)] hover:text-white"
                  )}
                  aria-expanded={collapsed ? flyoutOpen : groupOpen}
                  aria-haspopup={collapsed ? "menu" : undefined}
                  title={collapsed ? group.title : undefined}
                >
                  <GroupIcon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      groupActive ? "text-[var(--sidebar-primary)]" : "text-[var(--sidebar-item-muted)] group-hover/nav:text-white"
                    )}
                  />
                  {!collapsed ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[0.01em]">{group.title}</span>
                      {groupOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </>
                  ) : (
                    <>
                      <span className="sr-only">{group.title}</span>
                      <RailTooltip label={group.title} />
                    </>
                  )}
                </button>

                {collapsed && flyoutOpen ? (
                  <div
                    role="menu"
                    aria-label={`${group.title} navigation`}
                    className="absolute left-full top-0 z-50 ml-3 w-64 rounded-2xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface)_88%,black_12%)] p-2 shadow-[0_22px_50px_-34px_rgba(15,23,42,0.62)]"
                  >
                    <div className="rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_70%,transparent)] px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">{group.title}</div>
                      <div className="mt-1 text-xs text-[var(--sidebar-item-muted)]">Select a module</div>
                    </div>
                    <div className="mt-2 space-y-1">
                      {group.items.map((item) => renderFlyoutItem(group.title, item))}
                    </div>
                  </div>
                ) : null}

                {groupOpen ? (
                  <div className="space-y-1.5 border-l border-[var(--sidebar-rail-border)]/80 pl-4">
                    {group.items.map((item) => renderExpandedItem(group.title, item))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </nav>

      <div className="sticky bottom-0 border-t border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface)_92%,black_8%)] p-3">
        {!collapsed ? (
          <div className="rounded-2xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_76%,transparent)] p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{displayName}</div>
                <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">
                  {formatRoleLabel(role)}
                </div>
              </div>
              <Link
                href={getSettingsHref(role)}
                onClick={isMobile ? onClose : undefined}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_82%,transparent)] text-white transition hover:bg-[var(--sidebar-item-hover)]"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href={getProfileHref(role)}
                onClick={isMobile ? onClose : undefined}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_82%,transparent)] text-xs font-semibold text-white transition hover:bg-[var(--sidebar-item-hover)]"
              >
                Profile
              </Link>
              <button
                type="button"
                onClick={onLogout}
                disabled={isLoggingOut}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_82%,transparent)] text-xs font-semibold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="group relative">
              <Link
                href={getSettingsHref(role)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_82%,transparent)] text-white transition hover:bg-[var(--sidebar-item-hover)]"
                title="Settings"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
              <RailTooltip label="Settings" />
            </div>
            <div className="group relative">
              <button
                type="button"
                onClick={onLogout}
                disabled={isLoggingOut}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_82%,transparent)] text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
              <RailTooltip label="Logout" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Topbar({
  title,
  role,
  displayName,
  onOpenSidebar,
  onOpenCommandPalette,
  onOpenQuickActions,
  onLogout,
  isLoggingOut,
  mobileOpen,
}: {
  title: string;
  role: NavigationRole;
  displayName: string;
  onOpenSidebar: () => void;
  onOpenCommandPalette: () => void;
  onOpenQuickActions: () => void;
  onLogout: () => void;
  isLoggingOut: boolean;
  mobileOpen: boolean;
}) {
  return (
    <PortalHeader>
      <div className="flex min-h-[4.8rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--topbar-border)] bg-[var(--topbar-control)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:bg-[var(--surface-muted)] md:hidden"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar-nav"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="enterprise-eyebrow">{formatRoleLabel(role)} Workspace</span>
              <span className="workspace-pill px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Role Scope Active
              </span>
            </div>
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {role === "ADMIN" ? (
            <div className="hidden items-center gap-1.5 2xl:flex">
              {[
                { label: "Customer", href: `${ROUTES.admin.customers}/create` },
                { label: "Contract", href: ROUTES.admin.subscriptionsAdvanceEmiCreate },
                { label: "Direct Sale", href: ROUTES.admin.billingDirectSaleCreate },
                { label: "Payment", href: ROUTES.admin.financeCollect },
                { label: "Delivery", href: ROUTES.admin.deliveryCreate },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--topbar-border)] bg-[var(--topbar-control)] px-2.5 text-xs font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
                  title={`Create ${action.label}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--topbar-border)] bg-[var(--topbar-control)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:bg-[var(--surface-muted)] sm:hidden"
            aria-label="Open command palette"
            title="Command palette"
            data-testid="command-palette-trigger"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="hidden h-11 items-center gap-2 rounded-xl border border-[var(--topbar-border)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--topbar-control)_96%,white_4%),color-mix(in_oklab,var(--topbar-control)_84%,var(--surface-muted)_16%))] px-3 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] sm:inline-flex"
            aria-label="Open command palette (Ctrl+K)"
            title="Command palette (Ctrl+K)"
            data-testid="command-palette-trigger"
          >
            <Search className="h-4 w-4" />
            Command
            <span className="ml-1 rounded-lg border border-border bg-[var(--surface-card-elevated)] px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              Ctrl K
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenQuickActions}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-primary/80 bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-[0_18px_34px_-24px_rgba(30,64,175,0.62)] transition hover:bg-[color-mix(in_oklab,var(--primary)_90%,black_10%)]"
            aria-label="Open quick actions"
            title="Quick actions"
          >
            <ReceiptText className="h-4 w-4" />
            Quick Actions
          </button>
          <NotificationBellDropdown role={role} />
          <UserDropdown displayName={displayName} role={role} onLogout={onLogout} isLoggingOut={isLoggingOut} />
        </div>
      </div>
    </PortalHeader>
  );
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const nested = useContext(DashboardShellContext);
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const sessionSnapshot = useSyncExternalStore(subscribeDashboardShell, readSessionSnapshot, () => "null");
  const session = useMemo(() => parseSessionSnapshot(sessionSnapshot), [sessionSnapshot]);
  const { logout, isLoggingOut } = useLogout();
  const role = normalizeRole(session?.role);
  const sessionId = session?.id ?? null;
  const collapsedStorageKey = sidebarCollapsedKey(sessionId, role);
  const sidebarCollapsedSnapshot = useSyncExternalStore(
    subscribeDashboardShell,
    () => (readBooleanSetting(collapsedStorageKey, false) ? "true" : "false"),
    () => "false"
  );
  const sidebarCollapsed = sidebarCollapsedSnapshot === "true";
  const workspaceWidthPresetSnapshot = useSyncExternalStore(
    subscribeDashboardShell,
    readWorkspaceWidthPresetSnapshot,
    () => "2"
  );
  const workspaceWidthPreset = clampWorkspaceWidthPreset(
    Number.parseInt(workspaceWidthPresetSnapshot, 10)
  );
  const workspaceShellStyle = useMemo(
    () =>
      ({
        "--workspace-max-width": WORKSPACE_WIDTH_CSS_VALUES[workspaceWidthPreset],
      }) as CSSProperties,
    [workspaceWidthPreset]
  );
  const persistWorkspaceWidthPreset = useCallback((next: 0 | 1 | 2) => {
    try {
      window.localStorage.setItem(WORKSPACE_WIDTH_PRESET_KEY, String(next));
    } catch {
      // preference-only
    }
    notifyDashboardShellChanged();
  }, []);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandEpoch, setCommandEpoch] = useState(0);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);

  const openCommandPalette = useCallback(() => {
    setCommandEpoch((prev) => prev + 1);
    setCommandOpen(true);
  }, [setCommandEpoch, setCommandOpen]);

  function toggleSidebarCollapse() {
    const next = !sidebarCollapsed;
    try {
      window.localStorage.setItem(collapsedStorageKey, String(next));
    } catch {
      // Non-critical preference persistence.
    }
    notifyDashboardShellChanged();
  }

  const displayName = session?.name || "User";
  const title = pathname === getRoleBasePath(role) ? "Dashboard" : buildPageTitle(pathname);

  useEffect(() => {
    if (nested) return;
    if (!sessionId) return;
    pushRecent(sessionId, role, pathname);
  }, [nested, pathname, role, sessionId]);

  useEffect(() => {
    if (nested) return;
    function shouldIgnore(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return false;
      const tag = target.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnore(event)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nested, openCommandPalette]);

  if (nested) {
    return <>{children}</>;
  }

  return (
    <DashboardShellContext.Provider value={true}>
      <WorkflowProvider role={role}>
        <div className="relative" style={workspaceShellStyle}>
          <PortalShell
            sidebar={
              <RoleSidebar collapsed={sidebarCollapsed}>
                <SidebarContent
                  key={`sidebar:${role}:${sessionId ?? "anon"}`}
                  role={role}
                  pathname={pathname}
                  displayName={displayName}
                  sessionId={sessionId}
                  onLogout={logout}
                  isLoggingOut={isLoggingOut}
                  collapsed={sidebarCollapsed}
                  onToggleCollapse={toggleSidebarCollapse}
                  workspaceWidthPreset={workspaceWidthPreset}
                  onWorkspaceWidthPresetChange={persistWorkspaceWidthPreset}
                />
              </RoleSidebar>
            }
            header={
              <Fragment>
                <Topbar
                  title={title}
                  role={role}
                  displayName={displayName}
                  onOpenSidebar={() => setMobileOpen(true)}
                  onOpenCommandPalette={openCommandPalette}
                  onOpenQuickActions={() => setQuickActionsOpen(true)}
                  onLogout={logout}
                  isLoggingOut={isLoggingOut}
                  mobileOpen={mobileOpen}
                />
                <AdminWorkspaceMenubar
                  role={role}
                  onOpenCommandPalette={openCommandPalette}
                  onOpenQuickActions={() => setQuickActionsOpen(true)}
                />
              </Fragment>
            }
          >
            <>
              <BusinessSetupWorkflowBanner role={role} pathname={pathname} />
              {children}
            </>
          </PortalShell>

          <RoleSidebar mobile mobileOpen={mobileOpen} onOverlayClick={() => setMobileOpen(false)}>
            <div id="mobile-sidebar-nav">
            <SidebarContent
              key={`sidebar-mobile:${role}:${sessionId ?? "anon"}`}
              role={role}
              pathname={pathname}
              displayName={displayName}
              sessionId={sessionId}
              onLogout={logout}
              isLoggingOut={isLoggingOut}
              collapsed={false}
              onToggleCollapse={toggleSidebarCollapse}
              onClose={() => setMobileOpen(false)}
              workspaceWidthPreset={workspaceWidthPreset}
              onWorkspaceWidthPresetChange={persistWorkspaceWidthPreset}
            />
            </div>
          </RoleSidebar>

          <QuickActionLauncher
            open={quickActionsOpen}
            onClose={() => setQuickActionsOpen(false)}
            role={role}
            sessionId={sessionId}
            currentPathname={pathname}
          />
          <CommandPalette
            key={`command:${role}:${sessionId ?? "anon"}:${commandEpoch}`}
            open={commandOpen}
            onClose={() => setCommandOpen(false)}
            role={role}
            sessionId={sessionId}
            currentPathname={pathname}
          />
        </div>
      </WorkflowProvider>
    </DashboardShellContext.Provider>
  );
}
