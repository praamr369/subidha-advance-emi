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
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
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
  Receipt,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Ticket,
  Trophy,
  Truck,
  UserCircle2,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";

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
import { cn } from "@/lib/utils";

const DashboardShellContext = createContext(false);

type DashboardShellProps = {
  children: ReactNode;
};

type ShellNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
};

type ShellNavGroup = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: ShellNavItem[];
};

type ShellQuickAction = {
  label: string;
  href: string;
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

const SIDEBAR_COLLAPSED_KEY = "subidha:dashboard-sidebar-collapsed:v1";
const SIDEBAR_GROUPS_KEY = "subidha:dashboard-sidebar-groups:v1";

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

function segmentToLabel(segment: string) {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildPageTitle(pathname: string) {
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

function isActivePath(pathname: string, href: string) {
  if (href === pathname) return true;
  if (
    href === ROUTES.admin.dashboard ||
    href === ROUTES.partner.dashboard ||
    href === ROUTES.customer.dashboard ||
    href === ROUTES.cashier.dashboard
  ) {
    return false;
  }
  return pathname.startsWith(`${href}/`);
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
  return groups
    .map((group) => ({
      title: group.title,
      icon: ICON_MAP[group.icon ?? group.items[0]?.icon ?? "dashboard"],
      items: group.items
        .filter(
          (item) =>
            !item.hidden &&
            typeof item.href === "string" &&
            item.href.trim().length > 0
        )
        .map((item) => ({
          label: item.label,
          href: item.href,
          icon: ICON_MAP[item.icon],
          disabled: Boolean(item.disabled),
        })),
    }))
    .filter((group) => group.items.length > 0);
}

function getRoleWorkspaceLabel(role: NavigationRole) {
  switch (role) {
    case "ADMIN":
      return "Admin Control Center";
    case "PARTNER":
      return "Partner Operations";
    case "CUSTOMER":
      return "Customer Workspace";
    case "CASHIER":
      return "Cashier Counter";
    default:
      return "Workspace";
  }
}

function getRoleWorkspaceDescription(role: NavigationRole) {
  switch (role) {
    case "ADMIN":
      return "Collections, billing, inventory, accounting, workforce, and branch governance in one controlled rail.";
    case "PARTNER":
      return "Track assigned customers, subscriptions, collections, and commission posture.";
    case "CUSTOMER":
      return "Monitor your subscriptions, payment history, delivery, and support records.";
    case "CASHIER":
      return "Run counter collections with branch-safe posting and receipt flow.";
    default:
      return "Role-based workspace.";
  }
}

function formatRoleLabel(role: NavigationRole) {
  if (role === "ADMIN") return "Admin";
  if (role === "PARTNER") return "Partner";
  if (role === "CUSTOMER") return "Customer";
  if (role === "CASHIER") return "Cashier";
  return "Workspace";
}

function getRoleQuickActions(role: NavigationRole): ShellQuickAction[] {
  switch (role) {
    case "ADMIN":
      return [
        {
          label: "New Subscription",
          href: ROUTES.admin.subscriptionsCreate,
        },
        {
          label: "Collect EMI",
          href: ROUTES.admin.paymentsCreate,
        },
        {
          label: "Direct Sale",
          href: ROUTES.admin.billingDirectSales,
        },
        {
          label: "Purchase Bill",
          href: ROUTES.admin.accountingPurchaseBills,
        },
        {
          label: "Stock Adjust",
          href: ROUTES.admin.inventoryAdjustments,
        },
        {
          label: "Branch Report",
          href: ROUTES.admin.branchReporting,
        },
      ];
    default:
      return [];
  }
}

function getProfileHref(role: NavigationRole) {
  switch (role) {
    case "CUSTOMER":
      return "/customer/profile";
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
      return "/customer/profile";
    default:
      return getRoleBasePath(role);
  }
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
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--topbar-border)] bg-[var(--topbar-surface)] px-2.5 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition hover:border-[var(--surface-border-strong)] hover:bg-white"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--surface-border-strong)] bg-[var(--surface-strong)] text-xs font-semibold text-foreground">
          {displayName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[150px] truncate text-sm font-semibold text-foreground">
            {displayName}
          </span>
          <span className="block text-[11px] text-muted-foreground">{formatRoleLabel(role)}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-56 animate-in fade-in-0 zoom-in-95 rounded-2xl border border-[var(--surface-border-strong)] bg-white p-2 shadow-[0_22px_50px_-34px_rgba(15,23,42,0.62)] duration-100">
          <div className="border-b border-border px-3 py-2">
            <div className="text-sm font-semibold text-foreground">{displayName}</div>
            <div className="text-xs text-muted-foreground">{formatRoleLabel(role)}</div>
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
      )}
    </div>
  );
}

function Sidebar({
  role,
  pathname,
  displayName,
  onLogout,
  isLoggingOut,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onClose,
}: {
  role: NavigationRole;
  pathname: string;
  displayName: string;
  onLogout: () => void;
  isLoggingOut: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const isMobile = typeof onClose === "function";
  const navGroups = useMemo(() => mapNavGroups(getNavigationGroupsForRole(role)), [role]);
  const activeHref = useMemo(() => {
    const matches = navGroups
      .flatMap((group) => group.items)
      .filter((item) => isActivePath(pathname, item.href))
      .sort((left, right) => right.href.length - left.href.length);
    return matches[0]?.href ?? null;
  }, [navGroups, pathname]);
  const quickActions = useMemo(() => getRoleQuickActions(role), [role]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () => readExpandedGroups()
  );
  const [flyoutGroup, setFlyoutGroup] = useState<string | null>(null);
  const [navQuery, setNavQuery] = useState("");
  const normalizedNavQuery = navQuery.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!normalizedNavQuery) return navGroups;

    return navGroups
      .map((group) => {
        const groupMatch = group.title.toLowerCase().includes(normalizedNavQuery);
        if (groupMatch) return group;
        return {
          ...group,
          items: group.items.filter((item) =>
            item.label.toLowerCase().includes(normalizedNavQuery)
          ),
        };
      })
      .filter((group) => group.items.length > 0);
  }, [navGroups, normalizedNavQuery]);

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

  const sidebarClasses = cn(
    "dashboard-shell-chrome flex flex-col border-r border-[var(--sidebar-rail-border)] text-[var(--sidebar-foreground)] transition-all duration-300",
    "bg-[linear-gradient(180deg,var(--sidebar-surface),color-mix(in_oklab,var(--sidebar-surface-alt)_74%,black_26%))]",
    isMobile ? "fixed inset-y-0 left-0 z-50 md:hidden" : "h-screen",
    isMobile ? (mobileOpen ? "translate-x-0" : "-translate-x-full") : collapsed ? "w-[5.8rem]" : "w-[19rem]"
  );

  return (
    <>
      {isMobile && mobileOpen ? (
        <div
          className="dashboard-shell-chrome fixed inset-0 z-40 bg-slate-950/55 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}

      <aside className={sidebarClasses} onMouseLeave={() => setFlyoutGroup(null)}>
        <div className="sticky top-0 z-10 border-b border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface)_92%,black_8%)]">
          <div className="flex h-[4.75rem] items-center gap-3 px-4">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--sidebar-item-active-border)] bg-[var(--sidebar-item-active)] text-sm font-semibold text-[var(--sidebar-primary)] shadow-[0_10px_22px_-16px_rgba(15,23,42,0.9)]">
              SF
            </div>

            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">
                  {brandConfig.companyName}
                </div>
                <div className="truncate text-base font-semibold tracking-tight text-white">
                  {brandConfig.platformName}
                </div>
              </div>
            ) : (
              <span className="sr-only">{brandConfig.platformName}</span>
            )}

            {!isMobile ? (
              <button
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
          <div className="border-b border-[var(--sidebar-rail-border)] px-4 py-4">
            <div className="rounded-2xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_70%,transparent)] p-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">
                {getRoleWorkspaceLabel(role)}
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--sidebar-item-muted)]">
                {getRoleWorkspaceDescription(role)}
              </p>
            </div>

            {quickActions.length > 0 ? (
              <div className="mt-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">
                  Fast Actions
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {quickActions.map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_75%,transparent)] px-2 text-center text-[11px] font-semibold text-[var(--sidebar-foreground)] transition hover:border-[var(--sidebar-item-active-border)] hover:bg-[var(--sidebar-item-hover)]"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-3.5">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">
                Navigate
              </label>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--sidebar-item-muted)]" />
                <input
                  type="search"
                  value={navQuery}
                  onChange={(event) => setNavQuery(event.target.value)}
                  placeholder="Filter modules"
                  className="h-9 w-full rounded-lg border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_76%,transparent)] pl-9 pr-3 text-xs font-medium text-[var(--sidebar-foreground)] placeholder:text-[var(--sidebar-item-muted)] focus:border-[var(--sidebar-item-active-border)] focus:outline-none focus:ring-2 focus:ring-[var(--sidebar-item-active-border)]/30"
                />
              </div>
            </div>
          </div>
        ) : null}

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-2.5">
            {visibleGroups.length === 0 && !collapsed ? (
              <div className="rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_76%,transparent)] px-3 py-3 text-xs text-[var(--sidebar-item-muted)]">
                No navigation matches for &quot;{navQuery.trim()}&quot;.
              </div>
            ) : null}
            {visibleGroups.map((group, index) => {
              const GroupIcon = group.icon;
              const groupActive = group.items.some((item) => item.href === activeHref);
              const defaultOpen = role === "ADMIN" ? index === 0 : true;
              const groupOpen = !collapsed && (groupActive || (expandedGroups[group.title] ?? defaultOpen));
              const flyoutOpen = collapsed && flyoutGroup === group.title;

              return (
                <section
                  key={group.title}
                  className="relative space-y-1"
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
                      "group flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition",
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
                        groupActive
                          ? "text-[var(--sidebar-primary)]"
                          : "text-[var(--sidebar-item-muted)] group-hover:text-white"
                      )}
                    />
                    {!collapsed ? (
                      <>
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-[0.01em]">
                          {group.title}
                        </span>
                        {groupOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </>
                    ) : (
                      <span className="sr-only">{group.title}</span>
                    )}
                  </button>

                  {collapsed && flyoutOpen ? (
                    <div
                      role="menu"
                      aria-label={`${group.title} navigation`}
                      className="absolute left-full top-0 z-50 ml-3 w-64 rounded-2xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface)_88%,black_12%)] p-2 shadow-[0_22px_50px_-34px_rgba(15,23,42,0.62)]"
                    >
                      <div className="rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_70%,transparent)] px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">
                          {group.title}
                        </div>
                        <div className="mt-1 text-xs text-[var(--sidebar-item-muted)]">
                          Select a module
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        {group.items.map((item) => {
                          const active = item.href === activeHref;
                          const Icon = item.icon;
                          const classes = cn(
                            "group relative flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition",
                            item.disabled
                              ? "cursor-not-allowed border-transparent text-[var(--sidebar-item-muted)] opacity-70"
                              : active
                              ? "border-[var(--sidebar-item-active-border)] bg-[var(--sidebar-item-active)] text-white"
                              : "border-transparent text-[var(--sidebar-item-muted)] hover:border-[var(--sidebar-rail-border)] hover:bg-[var(--sidebar-item-hover)] hover:text-white"
                          );

                          if (item.disabled) {
                            return (
                              <div
                                key={`${group.title}:${item.href}:${item.label}`}
                                className={classes}
                                aria-disabled="true"
                                title="Not available yet"
                              >
                                <Icon className="h-4 w-4 shrink-0 text-[var(--sidebar-item-muted)]" />
                                <span className="min-w-0 truncate text-[13px] font-medium">
                                  {item.label}
                                </span>
                              </div>
                            );
                          }

                          return (
                            <Link
                              key={`${group.title}:${item.href}:${item.label}`}
                              href={item.href}
                              onClick={isMobile ? onClose : undefined}
                              className={classes}
                              role="menuitem"
                            >
                              <Icon
                                className={cn(
                                  "h-4 w-4 shrink-0",
                                  active
                                    ? "text-[var(--sidebar-primary)]"
                                    : "text-[var(--sidebar-item-muted)] group-hover:text-white"
                                )}
                              />
                              <span className="min-w-0 truncate text-[13px] font-medium">
                                {item.label}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {groupOpen ? (
                    <div className="space-y-1 border-l border-[var(--sidebar-rail-border)]/80 pl-3">
                      {group.items.map((item) => {
                        const active = item.href === activeHref;
                        const Icon = item.icon;
                        const rowBase = cn(
                          "group relative flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-sm transition",
                          collapsed ? "justify-center" : "",
                          active
                            ? "border-[var(--sidebar-item-active-border)] bg-[var(--sidebar-item-active)] text-white"
                            : "border-transparent text-[var(--sidebar-item-muted)] hover:border-[var(--sidebar-rail-border)] hover:bg-[var(--sidebar-item-hover)] hover:text-white"
                        );

                        return (
                          item.disabled ? (
                            <div
                              key={`${group.title}:${item.href}:${item.label}`}
                              className={cn(
                                rowBase,
                                "cursor-not-allowed opacity-70"
                              )}
                              aria-disabled="true"
                              title="Not available yet"
                            >
                              <Icon className="h-4 w-4 shrink-0 text-[var(--sidebar-item-muted)]" />
                              {!collapsed ? (
                                <span className="min-w-0 truncate text-[13px] font-medium">
                                  {item.label}
                                </span>
                              ) : (
                                <span className="sr-only">{item.label}</span>
                              )}
                            </div>
                          ) : (
                            <Link
                              key={`${group.title}:${item.href}:${item.label}`}
                              href={item.href}
                              onClick={isMobile ? onClose : undefined}
                              className={rowBase}
                              title={collapsed ? item.label : undefined}
                            >
                              <Icon
                                className={cn(
                                  "h-4 w-4 shrink-0",
                                  active
                                    ? "text-[var(--sidebar-primary)]"
                                    : "text-[var(--sidebar-item-muted)] group-hover:text-white"
                                )}
                              />
                              {!collapsed ? (
                                <span className="min-w-0 truncate text-[13px] font-medium">
                                  {item.label}
                                </span>
                              ) : (
                                <span className="sr-only">{item.label}</span>
                              )}
                            </Link>
                          )
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </nav>

        <div className="sticky bottom-0 border-t border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface)_92%,black_8%)] p-3">
          {!collapsed ? (
            <div className="rounded-2xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_76%,transparent)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">
                    {displayName}
                  </div>
                  <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-section-label)]">
                    {formatRoleLabel(role)}
                  </div>
                </div>
                <Link
                  href={getSettingsHref(role)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_82%,transparent)] text-white transition hover:bg-[var(--sidebar-item-hover)]"
                  title="Settings"
                >
                  <Settings className="h-4 w-4" />
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  href={getProfileHref(role)}
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
              <Link
                href={getSettingsHref(role)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sidebar-rail-border)] bg-[color-mix(in_oklab,var(--sidebar-surface-alt)_82%,transparent)] text-white transition hover:bg-[var(--sidebar-item-hover)]"
                title="Settings"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
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
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function Topbar({
  title,
  role,
  displayName,
  onOpenSidebar,
  onLogout,
  isLoggingOut,
}: {
  title: string;
  role: NavigationRole;
  displayName: string;
  onOpenSidebar: () => void;
  onLogout: () => void;
  isLoggingOut: boolean;
}) {
  return (
    <header className="dashboard-shell-chrome sticky top-0 z-30 border-b border-[var(--topbar-border)] bg-[color-mix(in_oklab,var(--topbar-surface)_92%,white_8%)] backdrop-blur-xl">
      <div className="flex min-h-[4.4rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--topbar-border)] bg-[var(--surface-card)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:bg-white md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <div className="enterprise-eyebrow">{formatRoleLabel(role)} Workspace</div>
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          </div>
        </div>

        <UserDropdown
          displayName={displayName}
          role={role}
          onLogout={onLogout}
          isLoggingOut={isLoggingOut}
        />
      </div>
    </header>
  );
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const nested = useContext(DashboardShellContext);
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readBooleanSetting(SIDEBAR_COLLAPSED_KEY, false)
  );
  const [session, setSession] = useState(() => getStoredSession());
  const { logout, isLoggingOut } = useLogout();

  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
    } catch {
      // Non-critical preference persistence.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    function handleStorage() {
      setSession(getStoredSession());
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  if (nested) {
    return <>{children}</>;
  }

  const role = normalizeRole(session?.role);
  const displayName = session?.name || "User";
  const title = pathname === getRoleBasePath(role) ? "Dashboard" : buildPageTitle(pathname);

  return (
    <DashboardShellContext.Provider value={true}>
      <div className="dashboard-app text-foreground">
        <div className="flex min-h-screen">
          <div className="hidden md:block">
            <Sidebar
              role={role}
              pathname={pathname}
              displayName={displayName}
              onLogout={logout}
              isLoggingOut={isLoggingOut}
              collapsed={sidebarCollapsed}
              onToggleCollapse={toggleSidebarCollapse}
            />
          </div>

          {mobileOpen ? (
            <Sidebar
              role={role}
              pathname={pathname}
              displayName={displayName}
              onLogout={logout}
              isLoggingOut={isLoggingOut}
              collapsed={false}
              onToggleCollapse={toggleSidebarCollapse}
              mobileOpen={mobileOpen}
              onClose={() => setMobileOpen(false)}
            />
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              title={title}
              role={role}
              displayName={displayName}
              onOpenSidebar={() => setMobileOpen(true)}
              onLogout={logout}
              isLoggingOut={isLoggingOut}
            />

            <main className="flex-1">
              <div className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </DashboardShellContext.Provider>
  );
}
