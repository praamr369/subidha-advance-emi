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
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Gift,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  UserCircle2,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { getStoredSession } from "@/lib/auth/session";
import { useLogout } from "@/hooks/useLogout";
import { ROUTES } from "@/lib/routes";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";
import {
  getNavigationGroupsForRole,
  normalizeRole,
  type NavGroup,
  type NavIconKey,
  type NavigationRole,
} from "@/config/navigation";

// Simple cn utility
function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const DashboardShellContext = createContext(false);

type DashboardShellProps = {
  children: ReactNode;
};

type ShellNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type ShellNavGroup = {
  title: string;
  items: ShellNavItem[];
};

type ShellQuickAction = {
  label: string;
  href: string;
};

const ICON_MAP: Record<NavIconKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  analytics: BarChart3,
  home: Home,
  customers: Users,
  deliveries: Package,
  leads: Search,
  products: Package,
  subscriptions: ClipboardList,
  payments: CreditCard,
  emis: Receipt,
  collections: Wallet,
  batches: Wallet,
  partners: Users,
  finance: Wallet,
  reconciliation: ShieldCheck,
  commissions: Wallet,
  settledCommissions: CreditCard,
  payoutBatches: Receipt,
  luckyIds: Gift,
  luckyDraws: Gift,
  reports: BarChart3,
  settings: Settings,
  auditLogs: ShieldCheck,
  profile: UserCircle2,
  support: ShieldCheck,
  collectPayment: CreditCard,
};

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
  return groups.map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({
      label: item.label,
      href: item.href,
      icon: ICON_MAP[item.icon],
    })),
  }));
}

function getRoleWorkspaceLabel(role: NavigationRole) {
  switch (role) {
    case "ADMIN":
      return "Admin Operations";
    case "PARTNER":
      return "Partner Operations";
    case "CUSTOMER":
      return "Customer Workspace";
    case "CASHIER":
      return "Cashier Workspace";
    default:
      return "Workspace";
  }
}

function getRoleWorkspaceDescription(role: NavigationRole) {
  switch (role) {
    case "ADMIN":
      return "Unified admin platform for EMI operations, retail-ready billing, inventory control, partner finance, accounting books, and governance.";
    case "PARTNER":
      return "Track customers, subscriptions, commissions, and collections.";
    case "CUSTOMER":
      return "View subscriptions, payments, and account activity.";
    case "CASHIER":
      return "Daily collection handling and payment entry workflow.";
    default:
      return "Role-based workspace.";
  }
}

function getRoleQuickActions(role: NavigationRole): ShellQuickAction[] {
  switch (role) {
    case "ADMIN":
      return [
        {
          label: "Collect EMI",
          href: ROUTES.admin.paymentsCreate,
        },
        {
          label: "New Contract",
          href: ROUTES.admin.subscriptionsCreate,
        },
        {
          label: "New Product",
          href: ROUTES.admin.productsCreate,
        },
        {
          label: "Opening Stock",
          href: ROUTES.admin.inventoryOpeningStock,
        },
        {
          label: "Overdue EMI",
          href: ROUTES.admin.emisOverdue,
        },
        {
          label: "Flagged Recon",
          href: buildAdminReconciliationRoute({ flagged: true }),
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

// Enhanced User Dropdown with modern styling
function UserDropdown({ displayName, role, onLogout, isLoggingOut }: {
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
        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-sm font-semibold text-primary-foreground shadow-sm">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="hidden text-left sm:block">
          <div className="text-sm font-semibold text-foreground">{displayName}</div>
          <div className="text-xs text-muted-foreground">{role}</div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card shadow-xl z-50 animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="p-2">
            <div className="border-b border-border px-3 py-2">
              <div className="text-sm font-medium text-foreground">{displayName}</div>
              <div className="text-xs text-muted-foreground">{role}</div>
            </div>
            <Link
              href={profileHref}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition hover:bg-muted"
              onClick={() => setIsOpen(false)}
            >
              <UserCircle2 className="h-4 w-4" />
              Profile
            </Link>
            <Link
              href={settingsHref}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition hover:bg-muted"
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
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {isLoggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Sidebar Component (collapsible, with modern gradient background)
function Sidebar({
  role,
  pathname,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onClose,
}: {
  role: NavigationRole;
  pathname: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const isMobile = typeof onClose === "function";
  const navGroups = useMemo(
    () => mapNavGroups(getNavigationGroupsForRole(role)),
    [role]
  );
  const quickActions = useMemo(() => getRoleQuickActions(role), [role]);

  const sidebarClasses = cn(
    isMobile
      ? "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-gradient-to-b from-sidebar to-sidebar/95 text-sidebar-foreground transition-transform md:hidden"
      : "flex h-screen flex-col border-r border-sidebar-border bg-gradient-to-b from-sidebar to-sidebar/95 text-sidebar-foreground transition-all duration-300",
    isMobile ? (mobileOpen ? "translate-x-0" : "-translate-x-full") : (collapsed ? "w-20" : "w-72")
  );

  return (
    <>
      {isMobile && mobileOpen && (
        <div
          className="dashboard-shell-chrome fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside className={cn(sidebarClasses, "dashboard-shell-chrome")}>
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          {!collapsed && (
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Subidha Furniture
              </div>
              <div className="text-lg font-semibold tracking-tight">SUBIDHA CORE</div>
            </div>
          )}
          {collapsed && (
            <div className="mx-auto">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                SC
              </div>
            </div>
          )}
          {!isMobile && (
            <button
              onClick={onToggleCollapse}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sidebar-border bg-background text-foreground transition hover:bg-muted"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
          {isMobile && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-sidebar-border bg-background text-foreground"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!collapsed && (
          <div className="border-b border-sidebar-border px-5 py-4">
            <div className="rounded-xl border border-sidebar-border bg-card/10 p-4 backdrop-blur-sm">
              <div className="text-sm font-semibold text-card-foreground">
                {getRoleWorkspaceLabel(role)}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {getRoleWorkspaceDescription(role)}
              </p>
              {quickActions.length > 0 ? (
                <div className="mt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Quick Actions
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {quickActions.map((action) => (
                      <Link
                        key={action.href}
                        href={action.href}
                        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-sidebar-border bg-background px-3 text-center text-xs font-semibold text-foreground transition hover:bg-muted"
                      >
                        {action.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-6">
            {navGroups.map((group) => (
              <div key={group.title}>
                {!collapsed && (
                  <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {group.title}
                  </div>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={isMobile ? onClose : undefined}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          active
                            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          collapsed && "justify-center"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-5 w-5 shrink-0 transition-transform group-hover:scale-110",
                            active
                              ? "text-sidebar-primary-foreground"
                              : "text-muted-foreground group-hover:text-sidebar-accent-foreground"
                          )}
                        />
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {!collapsed && (
          <div className="border-t border-sidebar-border p-4">
            <div className="rounded-xl border border-sidebar-border bg-muted/10 p-4 backdrop-blur-sm">
              <div className="text-sm font-semibold">Production Mode</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Stable daily operation with backward-compatible structure for future growth.
              </p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="border-t border-sidebar-border p-4 text-center">
            <div className="text-xs font-semibold text-muted-foreground">PM</div>
          </div>
        )}
      </aside>
    </>
  );
}

// Topbar Component with modern shadow and hover effects
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
    <header className="dashboard-shell-chrome sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 shadow-sm">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:bg-muted hover:shadow-sm md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {role}
            </div>
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Global Search */}
          <div className="hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                className="h-10 w-64 rounded-xl border border-border bg-background pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring lg:w-80"
              />
            </div>
          </div>

          {/* Notifications */}
          <button
            type="button"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground hover:shadow-sm"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              3
            </span>
          </button>

          {/* Help */}
          <button
            type="button"
            className="hidden h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground hover:shadow-sm md:flex"
            aria-label="Help"
          >
            <HelpCircle className="h-5 w-5" />
          </button>

          {/* User Dropdown */}
          <UserDropdown
            displayName={displayName}
            role={role}
            onLogout={onLogout}
            isLoggingOut={isLoggingOut}
          />
        </div>
      </div>
    </header>
  );
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const nested = useContext(DashboardShellContext);
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [session, setSession] = useState(() => getStoredSession());
  const { logout, isLoggingOut } = useLogout();

  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

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
  const title =
    pathname === getRoleBasePath(role) ? "Dashboard" : buildPageTitle(pathname);

  return (
    <DashboardShellContext.Provider value={true}>
      <div className="min-h-screen bg-background text-foreground">
        <div className="flex min-h-screen">
          {/* Desktop Sidebar */}
          <div className="hidden md:block">
            <Sidebar
              role={role}
              pathname={pathname}
              collapsed={sidebarCollapsed}
              onToggleCollapse={toggleSidebarCollapse}
            />
          </div>

          {/* Mobile Sidebar (drawer) */}
          {mobileOpen && (
            <Sidebar
              role={role}
              pathname={pathname}
              collapsed={false}
              onToggleCollapse={toggleSidebarCollapse}
              mobileOpen={mobileOpen}
              onClose={() => setMobileOpen(false)}
            />
          )}

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
              <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </DashboardShellContext.Provider>
  );
}
