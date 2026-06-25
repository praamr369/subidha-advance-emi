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
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Maximize2,
  Menu,
  Package,
  PanelLeft,
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

import ThemeToggle from "@/components/ui/ThemeToggle";
import NotificationBellDropdown from "@/components/layout/NotificationBellDropdown";
import PortalHeader from "@/components/layout/PortalHeader";
import PortalShell from "@/components/layout/PortalShell";
import AdminSidebarNav from "@/components/layout/AdminSidebarNav";
import RoleSidebar from "@/components/layout/RoleSidebar";
import SidebarHoverCard from "@/components/layout/SidebarHoverCard";
import BusinessSetupWorkflowBanner from "@/components/admin/business-setup/BusinessSetupWorkflowBanner";
import WorkflowProvider from "@/components/workflows/WorkflowProvider";
import AdminWorkspaceMenubar from "@/components/layout/AdminWorkspaceMenubar";
import CommandPalette from "@/components/workflows/CommandPalette";
import QuickActionLauncher from "@/components/workflows/QuickActionLauncher";
import { WorkspaceBrandMark } from "@/components/brand/WorkspaceBrandMark";
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
import { useAuth } from "@/providers/AuthProvider";
import { pushRecent, readFavorites, readRecents, toggleFavorite } from "@/lib/workspace-prefs";
import { cn } from "@/lib/utils";
import { getAdminNavigationBadges } from "@/services/navigation-badges";

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
/** Browser-local content width caps (100% zoom friendly; still bounded by viewport). */
const WORKSPACE_WIDTH_CSS_VALUES = ["1440px", "1480px", "1680px"] as const;
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

function buildBreadcrumb(pathname: string): { label: string }[] {
  const cleaned = pathname.replace(/^\/+|\/+$/g, "");
  const segments = cleaned.split("/").filter(Boolean);
  // Remove role prefix (admin/customer/…), skip pure numeric IDs
  const relative = segments.slice(1).filter((seg) => !/^\d+$/.test(seg));
  if (relative.length === 0) return [];
  return relative.slice(0, 3).map((seg) => ({ label: segmentToLabel(seg) }));
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
    cleanHref === ROUTES.cashier.dashboard ||
    cleanHref === ROUTES.vendor.dashboard
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
    case "VENDOR":
      return ROUTES.vendor.root;
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
  if (role === "VENDOR") return "Vendor";
  return "Workspace";
}

function getProfileHref(role: NavigationRole) {
  switch (role) {
    case "CUSTOMER":
      return ROUTES.customer.profile;
    case "ADMIN":
      return ROUTES.admin.settings;
    case "VENDOR":
      return ROUTES.vendor.profile;
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

function countsForGroup(groupTitle: string, badges: Record<string, number>): Array<{ label: string; value: number }> {
  const byGroup: Record<string, Array<{ label: string; key: string }>> = {
    "Command Center": [
      { label: "Outstanding", key: "admin.badges.outstanding_count" },
      { label: "Overdue", key: "admin.badges.overdue_count" },
    ],
    "Accounting & Reconciliation": [
      { label: "Overdue", key: "admin.badges.overdue_count" },
      { label: "Unreconciled", key: "admin.badges.unreconciled_count" },
    ],
    "Delivery & Service": [
      { label: "Returns", key: "admin.badges.pending_return_count" },
      { label: "Refunds", key: "admin.badges.pending_refund_count" },
    ],
    "Sales & Contracts": [
      { label: "Delivery", key: "admin.badges.pending_delivery_count" },
    ],
    "Lucky Plan Control": [
      { label: "Pending Draw", key: "admin.badges.pending_draw_count" },
    ],
    "Inventory & Stock": [
      { label: "Low Stock", key: "admin.badges.low_stock_count" },
      { label: "Inspection", key: "admin.badges.inspection_stock_count" },
    ],
    "CRM & Requests": [{ label: "Support", key: "admin.badges.open_support_ticket_count" }],
  };
  return (byGroup[groupTitle] ?? [])
    .map((row) => ({ label: row.label, value: Number(badges[row.key] ?? 0) }))
    .filter((row) => row.value > 0);
}

function RailTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 rounded-md border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface)_92%,black_8%)] px-2 py-1 text-xs font-medium text-white shadow-lg group-hover:block group-focus-within:block">
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
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--topbar-border)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--topbar-control)_96%,white_4%),color-mix(in_oklab,var(--topbar-control)_84%,var(--surface-muted)_16%))] px-2.5 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_14px_34px_-30px_rgba(15,23,42,0.5)] transition hover:border-border hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/35"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`Open account menu for ${displayName}, ${formatRoleLabel(role)}`}
      >
        <WorkspaceBrandMark size={32} variant="onLight" />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[min(12rem,28vw)] truncate text-sm font-semibold text-foreground">{displayName}</span>
          <span className="block text-xs text-muted-foreground">{formatRoleLabel(role)}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {isOpen ? (
        <div
          className="surface-glass absolute right-0 z-50 mt-2 w-56 animate-in fade-in-0 zoom-in-95 rounded-xl p-2 duration-100"
          role="menu"
          aria-label="Account menu"
        >
          <div className="flex items-center gap-3 border-b border-border px-3 py-2">
            <WorkspaceBrandMark size={36} variant="onLight" className="rounded-xl" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
              <div className="text-xs text-muted-foreground">{formatRoleLabel(role)}</div>
            </div>
          </div>
          <Link
            href={profileHref}
            className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition hover:bg-muted/50"
            onClick={() => setIsOpen(false)}
          >
            <UserCircle2 className="h-4 w-4" />
            Profile
          </Link>
          <Link
            href={settingsHref}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition hover:bg-muted/50"
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

type TopbarQuickAction = {
  key: string;
  label: string;
  title: string;
  href: unknown;
};

function isConcreteLinkHref(href: unknown): href is string {
  return typeof href === "string" && href.trim().length > 0;
}

function warnInvalidTopbarAction(action: TopbarQuickAction) {
  if (process.env.NODE_ENV === "production") return;
  console.warn("[Topbar] Skipping quick action with invalid href", {
    key: action.key,
    label: action.label,
    href: action.href,
  });
}

function hasValidTopbarHref(action: TopbarQuickAction): action is TopbarQuickAction & { href: string } {
  const valid = isConcreteLinkHref(action.href);
  if (!valid) warnInvalidTopbarAction(action);
  return valid;
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
  const recentLinks = useMemo(() => {
    if (!sessionId) return [];
    const recentHrefs = readRecents(sessionId, role).slice(0, 4);
    const allItems = navGroups.flatMap((group) => flattenShellItems(group.items));
    return recentHrefs
      .map((href) => {
        const match = allItems.find((item) => item.href === href);
        return match ? { href, label: match.label } : null;
      })
      .filter((item): item is { href: string; label: string } => Boolean(item));
  }, [navGroups, role, sessionId]);

  const modeFilteredGroups = useMemo(() => {
    if (role !== "ADMIN" || operatorMode !== "SIMPLE") return navGroups;
    // Simple mode shows all 15 groups but restricts Accounting & Reconciliation
    // to the most essential daily items so daily operators aren't overwhelmed.
    const simpleAccountingAllowed = new Set([
      "Reconciliation",
      "Accounting Control Center",
      "Accounting Setup",
      "Journals",
    ]);
    return navGroups
      .map((group) => {
        if (group.title !== "Accounting & Reconciliation") return group;
        return {
          ...group,
          items: group.items.filter((item) => simpleAccountingAllowed.has(item.label)),
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
        const payload = await getAdminNavigationBadges();
        if (cancelled) return;
        setQueueBadges(
          Object.entries(payload).reduce<Record<string, number>>((acc, [key, value]) => {
            acc[`admin.badges.${key}`] = Number(value || 0);
            return acc;
          }, {})
        );
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
        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">
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
      const rowActive = !item.disabled && (active || childActive);
      const rowShell = cn(
        "flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm transition-colors outline-none",
        depth > 0 ? "ml-2" : "",
        item.disabled
          ? "cursor-not-allowed text-[var(--sidebar-item-muted)] opacity-60"
          : rowActive
            ? "bg-[color-mix(in_oklab,var(--sidebar-primary)_22%,transparent)] text-[var(--sidebar-foreground)]"
            : "text-[var(--sidebar-item-muted)] hover:bg-card/[0.06] hover:text-[var(--sidebar-foreground)]"
      );

      const key = `${groupTitle}:${item.href}:${item.label}:${depth}`;
      const row = item.disabled ? (
        <div key={key} className={rowShell} aria-disabled="true" title="Not available yet">
          <span className="h-5 w-0.5 shrink-0 rounded-full bg-transparent" aria-hidden />
          <Icon className="h-4 w-4 shrink-0 opacity-70" />
          <span className="min-w-0 truncate text-[13px] font-medium">{item.label}</span>
          {renderBadge(item)}
        </div>
      ) : (
        <Link
          key={key}
          href={item.href}
          onClick={isMobile ? onClose : undefined}
          className={cn(rowShell, "focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45")}
          role="menuitem"
          aria-current={active ? "page" : undefined}
        >
          <span
            className={cn(
              "h-5 w-0.5 shrink-0 rounded-full transition-colors",
              active ? "bg-[var(--sidebar-primary)]" : "bg-transparent"
            )}
            aria-hidden
          />
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              active || childActive ? "text-[var(--sidebar-primary)]" : "opacity-90"
            )}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.label}</span>
          {renderBadge(item)}
        </Link>
      );

      return (
        <div key={key}>
          {row}
          {item.children && item.children.length > 0 ? (
            <div className="mt-0.5 space-y-0.5 border-l border-white/[0.08] pl-2 ml-2">
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
      const rowHighlight = !item.disabled && (active || childActive);
      const rowBase = cn(
        "group/item flex min-h-10 items-center gap-1 rounded-lg pr-1 text-sm transition-colors outline-none",
        depth > 0 ? "ml-1" : "",
        item.disabled
          ? "cursor-not-allowed text-[var(--sidebar-item-muted)] opacity-60"
          : rowHighlight
            ? "bg-[color-mix(in_oklab,var(--sidebar-primary)_22%,transparent)] text-[var(--sidebar-foreground)]"
            : "text-[var(--sidebar-item-muted)] hover:bg-card/[0.06] hover:text-[var(--sidebar-foreground)]"
      );

      const rowContent = (
        <>
          <span
            className={cn(
              "h-5 w-0.5 shrink-0 rounded-full transition-colors",
              active ? "bg-[var(--sidebar-primary)]" : "bg-transparent"
            )}
            aria-hidden
          />
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              active || childActive ? "text-[var(--sidebar-primary)]" : "opacity-90"
            )}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.label}</span>
          {renderBadge(item)}
        </>
      );

      const row = item.disabled ? (
        <div className={cn(rowBase, "px-2")} aria-disabled="true" title="Not available yet">
          {rowContent}
        </div>
      ) : (
        <div className={rowBase} title={collapsed ? item.label : undefined}>
          <Link
            href={item.href}
            onClick={isMobile ? onClose : undefined}
            className={cn(
              "flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
            )}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
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
              className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-item-muted)] transition-colors hover:bg-card/[0.06] hover:text-[var(--sidebar-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45 md:min-h-8 md:min-w-8"
              aria-label={itemOpen ? `Collapse ${item.label}` : `Expand ${item.label}`}
            >
              {itemOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : sessionId && !collapsed ? (
            <button
              type="button"
              className={cn(
                "inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-item-muted)] opacity-0 transition-colors hover:bg-card/[0.06] hover:text-[var(--sidebar-primary)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45 group-hover/item:opacity-100 md:min-h-8 md:min-w-8",
                favorites.includes(item.href) ? "opacity-100 text-[var(--sidebar-primary)]" : ""
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
              <Star className={cn("h-4 w-4", favorites.includes(item.href) ? "fill-[var(--sidebar-primary)] text-[var(--sidebar-primary)]" : "")} />
            </button>
          ) : null}
        </div>
      );

      return (
        <div key={itemKey} className="space-y-0.5">
          {row}
          {itemOpen ? (
            <div className="space-y-0.5 border-l border-white/[0.08] pl-2 ml-2">
              {item.children!.map((child) => renderExpandedItem(groupTitle, child, depth + 1))}
            </div>
          ) : null}
        </div>
      );
  }

  if (role === "ADMIN" && !collapsed) {
    const adminFooter = (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <WorkspaceBrandMark size={32} variant="onSidebar" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-[var(--sidebar-foreground)]">
              {displayName}
            </div>
            <div className="truncate text-[11px] text-[var(--sidebar-section-label)]">
              {formatRoleLabel(role)}
            </div>
          </div>
          <ToggleGroup
            type="single"
            value={operatorMode}
            aria-label="Operator mode"
            title="Simple hides advanced finance modules. Advanced shows the full catalog."
            onValueChange={(value: string) => {
              if (value !== "SIMPLE" && value !== "ADVANCED") return;
              persistOperatorMode(value as OperatorMode);
            }}
            className="gap-0.5 rounded-lg border-0 bg-card/[0.04] p-0.5 shadow-none ring-1 ring-inset ring-white/[0.06]"
          >
            <ToggleGroupItem
              value="SIMPLE"
              aria-label="Simple workflow view"
              className="h-7 rounded-md px-2 text-[11px] font-semibold text-[var(--sidebar-item-muted)] shadow-none hover:text-[var(--sidebar-foreground)] data-[state=on]:bg-[color-mix(in_oklab,var(--sidebar-primary)_22%,transparent)] data-[state=on]:text-[var(--sidebar-primary)]"
            >
              Simple
            </ToggleGroupItem>
            <ToggleGroupItem
              value="ADVANCED"
              aria-label="Advanced ERP view"
              className="h-7 rounded-md px-2 text-[11px] font-semibold text-[var(--sidebar-item-muted)] shadow-none hover:text-[var(--sidebar-foreground)] data-[state=on]:bg-[color-mix(in_oklab,var(--sidebar-primary)_22%,transparent)] data-[state=on]:text-[var(--sidebar-primary)]"
            >
              Advanced
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex gap-2">
          <Link
            href={getProfileHref(role)}
            onClick={isMobile ? onClose : undefined}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-xl bg-card/[0.05] text-[12px] font-semibold text-[var(--sidebar-foreground)] transition-colors hover:bg-card/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
          >
            Profile
          </Link>
          <Link
            href={getSettingsHref(role)}
            onClick={isMobile ? onClose : undefined}
            className="inline-flex h-9 w-10 items-center justify-center rounded-xl bg-card/[0.05] text-[var(--sidebar-item-muted)] transition-colors hover:bg-card/[0.09] hover:text-[var(--sidebar-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-xl bg-card/[0.05] text-[12px] font-semibold text-red-200/95 transition-colors hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/35 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingOut ? "..." : "Logout"}
          </button>
        </div>
      </div>
    );

    return (
      <AdminSidebarNav
        groups={visibleGroups}
        activeHref={activeHref}
        brandName={brandConfig.companyName}
        roleLabel={formatRoleLabel(role)}
        isMobile={isMobile}
        navQuery={navQuery}
        onNavQueryChange={setNavQuery}
        expandedGroups={expandedGroups}
        onToggleGroup={toggleGroup}
        favorites={favorites}
        onToggleFavorite={(href) => {
          if (!sessionId) return;
          setFavorites(toggleFavorite(sessionId, role, href));
        }}
        canFavorite={Boolean(sessionId)}
        badges={queueBadges}
        favoriteLinks={favoriteLinks}
        brandSlot={<WorkspaceBrandMark size={32} variant="onSidebar" />}
        footerSlot={adminFooter}
        onToggleCollapse={onToggleCollapse}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" onMouseLeave={() => setFlyoutGroup(null)}>
      <div className="sticky top-0 z-20 shrink-0 border-b border-white/[0.06] bg-[color-mix(in_oklab,var(--sidebar-surface)_96%,black_4%)]">
        <div className="flex h-[3.25rem] items-center gap-2.5 px-3 sm:px-3.5">
          <WorkspaceBrandMark size={32} variant="onSidebar" />

          {!collapsed ? (
            <div
              className="min-w-0 flex-1"
              title={`${brandConfig.systemProductName} — operational shell (internal)`}
            >
              <div className="truncate text-[13px] font-semibold leading-tight tracking-tight text-[var(--sidebar-foreground)]">
                {brandConfig.companyName}
              </div>
              <div className="truncate text-[11px] font-medium text-[var(--sidebar-section-label)]">
                {formatRoleLabel(role)} workspace
              </div>
            </div>
          ) : (
            <span className="sr-only">
              {brandConfig.companyName}. {formatRoleLabel(role)} workspace.
            </span>
          )}

          {!isMobile ? (
            <button
              type="button"
              onClick={() => {
                setFlyoutGroup(null);
                onToggleCollapse();
              }}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-item-muted)] transition-colors hover:bg-card/[0.06] hover:text-[var(--sidebar-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
              data-testid={collapsed ? "sidebar-expand-button" : "sidebar-collapse-button"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-item-muted)] transition-colors hover:bg-card/[0.06] hover:text-[var(--sidebar-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!collapsed ? (
        <div className="shrink-0 space-y-2.5 border-b border-white/[0.06] px-3 py-2.5 sm:px-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex max-w-[min(100%,14rem)] items-center truncate rounded-full bg-card/[0.06] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--sidebar-section-label)]">
              {formatRoleLabel(role)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-200/95">
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]" aria-hidden />
              Live
            </span>
          </div>

          {favoriteLinks.length > 0 ? (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--sidebar-section-label)]">
                Favorites
              </div>
              <div className="space-y-0.5">
                {favoriteLinks.map((item) => (
                  <div key={`fav-${item.href}`} className="group/fav flex min-h-10 items-center gap-1 rounded-lg pr-1 hover:bg-card/[0.04]">
                    <Link
                      href={item.href}
                      onClick={isMobile ? onClose : undefined}
                      className="min-w-0 flex-1 truncate rounded-md px-2 py-2 text-[13px] font-medium text-[var(--sidebar-item-muted)] transition-colors hover:text-[var(--sidebar-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
                      aria-label={item.label}
                    >
                      {item.label}
                    </Link>
                    {sessionId ? (
                      <button
                        type="button"
                        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[var(--sidebar-item-muted)] opacity-0 transition-colors hover:bg-card/[0.06] hover:text-[var(--sidebar-foreground)] group-hover/fav:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45 md:min-h-8 md:min-w-8"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const next = toggleFavorite(sessionId, role, item.href);
                          setFavorites(next);
                        }}
                        aria-label="Remove favorite"
                        title="Remove favorite"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <label
              htmlFor="sidebar-module-search"
              className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--sidebar-section-label)]"
            >
              Modules
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--sidebar-item-muted)] opacity-80" />
              <input
                id="sidebar-module-search"
                type="search"
                value={navQuery}
                onChange={(event) => setNavQuery(event.target.value)}
                placeholder="Search modules"
                className="h-9 w-full rounded-lg bg-card/[0.04] pl-9 pr-2.5 text-sm text-[var(--sidebar-foreground)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] placeholder:text-[var(--sidebar-item-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--sidebar-ring)]/40"
              />
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-white/[0.06] pt-2.5"
            title="Layout preference for this browser only (not stored on the server)."
          >
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--sidebar-section-label)]">
              View
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <ToggleGroup
                type="single"
                value={String(workspaceWidthPreset)}
                data-testid="workspace-width-slider"
                aria-label="Workspace content width preset"
                onValueChange={(value: string) => {
                  if (value !== "0" && value !== "1" && value !== "2") return;
                  onWorkspaceWidthPresetChange(clampWorkspaceWidthPreset(Number.parseInt(value, 10)));
                }}
                className="flex gap-0.5 rounded-md border-0 bg-transparent p-0 shadow-none"
              >
                <ToggleGroupItem
                  value="0"
                  aria-label={`Compact: max content width ${WORKSPACE_WIDTH_CSS_VALUES[0]}`}
                  title={`Compact (${WORKSPACE_WIDTH_CSS_VALUES[0]} cap for components that respect workspace width)`}
                  className="h-8 w-8 rounded-md border-0 bg-transparent p-0 text-[var(--sidebar-item-muted)] shadow-none hover:bg-card/[0.06] hover:text-[var(--sidebar-foreground)] data-[state=on]:bg-[color-mix(in_oklab,var(--sidebar-primary)_28%,transparent)] data-[state=on]:text-[var(--sidebar-primary)]"
                >
                  <PanelLeft className="mx-auto h-3.5 w-3.5" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="1"
                  aria-label={`Balanced: max content width ${WORKSPACE_WIDTH_CSS_VALUES[1]}`}
                  title={`Balanced (${WORKSPACE_WIDTH_CSS_VALUES[1]})`}
                  className="h-8 w-8 rounded-md border-0 bg-transparent p-0 text-[var(--sidebar-item-muted)] shadow-none hover:bg-card/[0.06] hover:text-[var(--sidebar-foreground)] data-[state=on]:bg-[color-mix(in_oklab,var(--sidebar-primary)_28%,transparent)] data-[state=on]:text-[var(--sidebar-primary)]"
                >
                  <LayoutGrid className="mx-auto h-3.5 w-3.5" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="2"
                  aria-label={`Spacious: max content width ${WORKSPACE_WIDTH_CSS_VALUES[2]}`}
                  title={`Spacious (${WORKSPACE_WIDTH_CSS_VALUES[2]})`}
                  className="h-8 w-8 rounded-md border-0 bg-transparent p-0 text-[var(--sidebar-item-muted)] shadow-none hover:bg-card/[0.06] hover:text-[var(--sidebar-foreground)] data-[state=on]:bg-[color-mix(in_oklab,var(--sidebar-primary)_28%,transparent)] data-[state=on]:text-[var(--sidebar-primary)]"
                >
                  <Maximize2 className="mx-auto h-3.5 w-3.5" />
                </ToggleGroupItem>
              </ToggleGroup>
              {role === "ADMIN" ? (
                <ToggleGroup
                  type="single"
                  value={operatorMode}
                  data-testid={isMobile ? "operator-mode-toggle-mobile" : "operator-mode-toggle"}
                  aria-label={operatorMode === "SIMPLE" ? "Switch Advanced" : "Switch Simple"}
                  title="Simple hides advanced finance modules in the sidebar. Advanced shows the full catalog."
                  onValueChange={(value: string) => {
                    if (value !== "SIMPLE" && value !== "ADVANCED") return;
                    persistOperatorMode(value as OperatorMode);
                  }}
                  onClick={(event) => {
                    if (event.target !== event.currentTarget) return;
                    persistOperatorMode(operatorMode === "SIMPLE" ? "ADVANCED" : "SIMPLE");
                  }}
                  className="gap-0 rounded-md border-0 bg-card/[0.04] p-0.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                >
                  <ToggleGroupItem
                    value="SIMPLE"
                    aria-label="Simple workflow view"
                    onClick={() => persistOperatorMode(operatorMode === "SIMPLE" ? "ADVANCED" : "SIMPLE")}
                    className="h-7 rounded px-2 text-[11px] font-semibold text-[var(--sidebar-item-muted)] shadow-none hover:text-[var(--sidebar-foreground)] data-[state=on]:bg-[color-mix(in_oklab,var(--sidebar-primary)_22%,transparent)] data-[state=on]:text-[var(--sidebar-primary)]"
                  >
                    Simple
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="ADVANCED"
                    aria-label="Advanced ERP view"
                    onClick={() => persistOperatorMode("ADVANCED")}
                    className="h-7 rounded px-2 text-[11px] font-semibold text-[var(--sidebar-item-muted)] shadow-none hover:text-[var(--sidebar-foreground)] data-[state=on]:bg-[color-mix(in_oklab,var(--sidebar-primary)_22%,transparent)] data-[state=on]:text-[var(--sidebar-primary)]"
                  >
                    Advanced
                  </ToggleGroupItem>
                </ToggleGroup>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <nav
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2 sm:px-3"
        role="navigation"
        aria-label={`${formatRoleLabel(role)} sidebar navigation`}
      >
        <div className="space-y-4">
          {collapsed && !isMobile ? (
            <div className="sticky top-0 z-30 pb-2">
              <button
                type="button"
                onClick={() => {
                  setFlyoutGroup(null);
                  onToggleCollapse();
                }}
                data-testid="sidebar-expand-button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] bg-[color-mix(in_oklab,var(--sidebar-surface)_88%,black_12%)] text-[var(--sidebar-foreground)] shadow-[0_8px_22px_-16px_rgba(0,0,0,0.65)] transition hover:bg-card/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/55"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          {visibleGroups.length === 0 && !collapsed ? (
            <div className="rounded-lg bg-card/[0.03] px-3 py-2.5 text-xs text-[var(--sidebar-item-muted)]">
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
                    "flex w-full min-h-10 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45",
                    collapsed ? "min-h-10 min-w-10 justify-center px-0" : "",
                    groupActive
                      ? "text-[var(--sidebar-foreground)]"
                      : "text-[var(--sidebar-section-label)] hover:bg-card/[0.04] hover:text-[var(--sidebar-foreground)]"
                  )}
                  aria-expanded={collapsed ? flyoutOpen : groupOpen}
                  aria-haspopup={collapsed ? "menu" : undefined}
                  title={collapsed ? group.title : undefined}
                >
                  <GroupIcon
                    className={cn(
                      "h-4 w-4 shrink-0 opacity-90",
                      groupActive ? "text-[var(--sidebar-primary)]" : ""
                    )}
                  />
                  {!collapsed ? (
                    <>
                      <span className="min-w-0 flex-1 truncate normal-case tracking-normal text-[13px] font-semibold">
                        {group.title}
                      </span>
                      {groupOpen ? <ChevronDown className="h-4 w-4 shrink-0 opacity-70" /> : <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />}
                    </>
                  ) : (
                    <>
                      <span className="sr-only">{group.title}</span>
                      <RailTooltip label={group.title} />
                    </>
                  )}
                </button>

                {collapsed && flyoutOpen ? (
                  <div role="menu" aria-label={`${group.title} navigation`}>
                    <SidebarHoverCard
                      title={group.title}
                      counts={countsForGroup(group.title, queueBadges)}
                      quickActions={group.items.slice(0, 3).map((item) => ({ label: item.label, href: item.href }))}
                      recentRoutes={recentLinks}
                      primaryAction={group.items[0] ? { label: `Open ${group.items[0].label}`, href: group.items[0].href } : undefined}
                    />
                    <div className="absolute left-full top-[14.5rem] z-50 ml-3 w-72 rounded-xl bg-[color-mix(in_oklab,var(--sidebar-surface)_94%,black_6%)] p-2 shadow-[0_22px_50px_-34px_rgba(28,25,23,0.55)] ring-1 ring-white/[0.08]">
                      <div className="space-y-0.5">{group.items.map((item) => renderFlyoutItem(group.title, item))}</div>
                    </div>
                  </div>
                ) : null}

                {groupOpen ? (
                  <div className="space-y-0.5 border-l border-white/[0.08] pl-2 ml-1.5">
                    {group.items.map((item) => renderExpandedItem(group.title, item))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </nav>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-white/[0.06] bg-[color-mix(in_oklab,var(--sidebar-surface)_97%,black_3%)] px-3 py-3 sm:px-3.5">
        {!collapsed ? (
          <>
            <div className="flex items-center gap-3">
              <WorkspaceBrandMark size={36} variant="onSidebar" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--sidebar-foreground)]">{displayName}</div>
                <div className="truncate text-[11px] text-[var(--sidebar-section-label)]">{formatRoleLabel(role)}</div>
              </div>
              <Link
                href={getSettingsHref(role)}
                onClick={isMobile ? onClose : undefined}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-item-muted)] transition-colors hover:bg-card/[0.06] hover:text-[var(--sidebar-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
                title="Settings"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-3 flex gap-2">
              <Link
                href={getProfileHref(role)}
                onClick={isMobile ? onClose : undefined}
                className="inline-flex h-10 min-h-10 flex-1 items-center justify-center rounded-lg bg-card/[0.05] text-xs font-semibold text-[var(--sidebar-foreground)] transition-colors hover:bg-card/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
              >
                Profile
              </Link>
              <button
                type="button"
                onClick={onLogout}
                disabled={isLoggingOut}
                className="inline-flex h-10 min-h-10 flex-1 items-center justify-center rounded-lg bg-card/[0.05] text-xs font-semibold text-red-200/95 transition-colors hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/35 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="group relative">
              <Link
                href={getProfileHref(role)}
                onClick={isMobile ? onClose : undefined}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--sidebar-item-muted)] transition-colors hover:bg-card/[0.06] hover:text-[var(--sidebar-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
                title={`Profile — ${displayName}`}
                aria-label={`Profile — ${displayName}`}
              >
                <WorkspaceBrandMark size={28} variant="onSidebar" />
              </Link>
              <RailTooltip label={`Profile (${displayName})`} />
            </div>
            <div className="group relative">
              <Link
                href={getSettingsHref(role)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--sidebar-item-muted)] transition-colors hover:bg-card/[0.06] hover:text-[var(--sidebar-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]/45"
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-200/95 transition-colors hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/35 disabled:cursor-not-allowed disabled:opacity-60"
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
  pathname,
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
  pathname: string;
  role: NavigationRole;
  displayName: string;
  onOpenSidebar: () => void;
  onOpenCommandPalette: () => void;
  onOpenQuickActions: () => void;
  onLogout: () => void;
  isLoggingOut: boolean;
  mobileOpen: boolean;
}) {
  const topbarActions: TopbarQuickAction[] =
    role === "ADMIN"
      ? [
          { key: "create-customer", label: "Customer", title: "Create customer", href: `${ROUTES.admin.customers}/create` },
          { key: "create-contract", label: "Contract", title: "Create contract", href: ROUTES.admin.subscriptionsAdvanceEmiCreate },
          { key: "create-direct-sale", label: "Direct Sale", title: "Create direct sale", href: ROUTES.admin.billingDirectSaleCreate },
          { key: "collect-payment", label: "Payment", title: "Collect payment", href: ROUTES.admin.financeCollect },
          { key: "open-delivery", label: "Delivery", title: "Open delivery", href: ROUTES.admin.deliveryCreate },
        ]
      : [];
  const validTopbarActions = topbarActions.filter(hasValidTopbarHref);

  // Admin: compact 52px desktop-app topbar with breadcrumb + centered search
  if (role === "ADMIN") {
    const crumbs = buildBreadcrumb(pathname);
    return (
      <PortalHeader>
        <div className="flex h-[52px] items-center gap-2 px-3 sm:px-4">
          {/* Left: mobile hamburger + breadcrumb */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--topbar-border)] bg-[var(--topbar-control)] text-foreground transition hover:bg-muted/50 md:hidden"
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              aria-controls="mobile-sidebar-nav"
            >
              <Menu className="h-4 w-4" />
            </button>
            {crumbs.length === 0 ? (
              <span className="text-sm font-semibold text-foreground">{title}</span>
            ) : (
              <nav className="flex min-w-0 items-center gap-0.5 text-sm" aria-label="Breadcrumb">
                {crumbs.map((crumb, i) => (
                  <Fragment key={`${crumb.label}-${i}`}>
                    {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" aria-hidden />}
                    <span
                      className={cn(
                        "truncate",
                        i === crumbs.length - 1
                          ? "font-semibold text-foreground"
                          : "hidden text-muted-foreground sm:block"
                      )}
                    >
                      {crumb.label}
                    </span>
                  </Fragment>
                ))}
              </nav>
            )}
          </div>

          {/* Center: command palette search bar */}
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="hidden h-9 shrink-0 items-center gap-2 rounded-lg border border-[var(--topbar-border)] bg-[color-mix(in_oklab,var(--topbar-control)_80%,var(--surface-muted)_20%)] px-3 text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground lg:flex"
            style={{ width: "260px" }}
            aria-label="Open command palette (Ctrl+K)"
            title="Command palette (Ctrl+K)"
            data-testid="command-palette-trigger"
          >
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="flex-1 text-left">Search anything…</span>
            <kbd className="shrink-0 rounded border border-border bg-[var(--surface-card-elevated)] px-1.5 py-0.5 text-[10px] font-medium">
              Ctrl K
            </kbd>
          </button>

          {/* Right: action bar */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Search icon for ≤md */}
            <button
              type="button"
              onClick={onOpenCommandPalette}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--topbar-border)] bg-[var(--topbar-control)] text-foreground transition hover:bg-muted/50 lg:hidden"
              aria-label="Open command palette"
              data-testid="command-palette-trigger"
            >
              <Search className="h-4 w-4" />
            </button>

            {/* Quick-create chips (xl only) */}
            <div className="hidden items-center gap-1 xl:flex">
              {validTopbarActions.map((action) => (
                <Link
                  key={action.key}
                  href={action.href}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--topbar-border)] bg-[var(--topbar-control)] px-2 text-xs font-medium text-foreground transition hover:border-border hover:bg-muted/50"
                  title={action.title}
                >
                  <Plus className="h-3 w-3 shrink-0" />
                  {action.label}
                </Link>
              ))}
            </div>

            {/* Quick actions button */}
            <button
              type="button"
              onClick={onOpenQuickActions}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-primary/80 bg-primary px-2.5 text-xs font-semibold text-primary-foreground shadow-[0_10px_24px_-16px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition hover:bg-[color-mix(in_oklab,var(--primary)_90%,black_10%)]"
              aria-label="Quick actions"
              title="Quick actions"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">New</span>
            </button>

            <ThemeToggle variant="dashboard" />
            <NotificationBellDropdown role={role} />
            <UserDropdown displayName={displayName} role={role} onLogout={onLogout} isLoggingOut={isLoggingOut} />
          </div>
        </div>
      </PortalHeader>
    );
  }

  // Non-admin: existing layout (cleaned up)
  return (
    <PortalHeader>
      <div className="flex min-h-[4rem] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 sm:gap-x-4 sm:px-4 lg:px-6">
        <div className="flex min-w-0 max-w-full flex-[1_1_10rem] items-center gap-2 sm:flex-[1_1_38%] sm:gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--topbar-border)] bg-[var(--topbar-control)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:bg-muted/50 md:hidden"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar-nav"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <span className="enterprise-eyebrow">{formatRoleLabel(role)} Portal</span>
            <h1 className="min-w-0 max-w-full break-words text-balance text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {title}
            </h1>
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-[1_1_14rem] flex-wrap items-center justify-end gap-2 sm:flex-[0_1_auto]">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--topbar-border)] bg-[var(--topbar-control)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:bg-muted/50 sm:hidden"
            aria-label="Open command palette"
            data-testid="command-palette-trigger"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="hidden h-10 items-center gap-2 rounded-xl border border-[var(--topbar-border)] bg-[var(--topbar-control)] px-3 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:bg-muted/50 sm:inline-flex"
            aria-label="Open command palette (Ctrl+K)"
            data-testid="command-palette-trigger"
          >
            <Search className="h-4 w-4" />
            Search
            <span className="ml-1 rounded-lg border border-border bg-[var(--surface-card-elevated)] px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              Ctrl K
            </span>
          </button>
          <ThemeToggle variant="dashboard" />
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileOpen = mobileMenuOpen;
  const sessionSnapshot = useSyncExternalStore(subscribeDashboardShell, readSessionSnapshot, () => "null");
  const session = useMemo(() => parseSessionSnapshot(sessionSnapshot), [sessionSnapshot]);
  const { logout, isLoggingOut } = useLogout();
  const { role: authRole } = useAuth();
  const role = useMemo(() => {
    const candidate = (authRole || "").trim();
    if (candidate) return normalizeRole(candidate);
    return normalizeRole(session?.role);
  }, [authRole, session]);
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
    void Promise.resolve().then(() => {
      setMobileMenuOpen(false);
    });
  }, [nested, pathname]);

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

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const openMobileMenu = useCallback(() => {
    setMobileMenuOpen(true);
  }, []);

  if (nested) {
    return <>{children}</>;
  }

  return (
    <DashboardShellContext.Provider value={true}>
      <WorkflowProvider role={role}>
        <div className="relative overflow-x-clip" style={workspaceShellStyle}>
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
                  pathname={pathname}
                  role={role}
                  displayName={displayName}
                  onOpenSidebar={openMobileMenu}
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

          <RoleSidebar mobile mobileOpen={mobileOpen} onOverlayClick={closeMobileMenu}>
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
              onClose={closeMobileMenu}
              workspaceWidthPreset={workspaceWidthPreset}
              onWorkspaceWidthPresetChange={persistWorkspaceWidthPreset}
            />
            </div>
          </RoleSidebar>

          <QuickActionLauncher
            open={quickActionsOpen}
            onClose={() => {
              setQuickActionsOpen(false);
              closeMobileMenu();
            }}
            role={role}
            sessionId={sessionId}
            currentPathname={pathname}
          />
          <CommandPalette
            key={`command:${role}:${sessionId ?? "anon"}:${commandEpoch}`}
            open={commandOpen}
            onClose={() => {
              setCommandOpen(false);
              closeMobileMenu();
            }}
            role={role}
            sessionId={sessionId}
            currentPathname={pathname}
          />
        </div>
      </WorkflowProvider>
    </DashboardShellContext.Provider>
  );
}
