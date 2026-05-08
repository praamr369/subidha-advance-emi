import { ROUTES } from "@/lib/routes";
import { ADMIN_ROUTE_TREE, type AdminRouteRegistryItem } from "@/config/admin-route-registry";

export type NavigationRole = "ADMIN" | "PARTNER" | "CUSTOMER" | "CASHIER" | "VENDOR";

export type NavIconKey =
  | "operations"
  | "crm"
  | "billing"
  | "inventory"
  | "procurement"
  | "manufacturing"
  | "serviceDesk"
  | "accounting"
  | "payroll"
  | "branches"
  | "governance"
  | "reminders"
  | "cashCounter"
  | "dashboard"
  | "analytics"
  | "home"
  | "customers"
  | "deliveries"
  | "leads"
  | "products"
  | "subscriptions"
  | "payments"
  | "emis"
  | "collections"
  | "batches"
  | "partners"
  | "finance"
  | "reconciliation"
  | "commissions"
  | "settledCommissions"
  | "payoutBatches"
  | "luckyIds"
  | "luckyDraws"
  | "reports"
  | "settings"
  | "auditLogs"
  | "profile"
  | "support"
  | "collectPayment";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIconKey;
  hidden?: boolean;
  disabled?: boolean;
  description?: string;
  badgeSource?: string;
  children?: NavItem[];
};

export type NavGroup = {
  title: string;
  icon?: NavIconKey;
  items: NavItem[];
};

function flattenGroups(groups: NavGroup[]): NavItem[] {
  const flattenItems = (items: NavItem[]): NavItem[] =>
    items.flatMap((item) => [item, ...(item.children ? flattenItems(item.children) : [])]);
  return groups.flatMap((group) => flattenItems(group.items));
}

function iconForGroup(group: string): NavIconKey {
  const key = group.toLowerCase();
  if (key.includes("command")) return "dashboard";
  if (key.includes("crm") || key.includes("customer")) return "crm";
  if (key.includes("sales")) return "billing";
  if (key.includes("subscription") || key.includes("contract")) return "subscriptions";
  if (key.includes("partner")) return "partners";
  if (key.includes("billing")) return "finance";
  if (key.includes("finance")) return "finance";
  if (key.includes("product") || key.includes("inventory")) return "inventory";
  if (key.includes("manufacturing") || key.includes("quality") || key.includes("maintenance")) return "manufacturing";
  if (key.includes("delivery")) return "deliveries";
  if (key.includes("lucky")) return "luckyDraws";
  if (key.includes("staff") || key.includes("setup") || key.includes("admin")) return "settings";
  return "operations";
}

function normalizeAdminGroupTitle(title: string): string {
  const key = title.toLowerCase();
  if (key.includes("command")) return "Command Center";
  if (key.includes("sales")) return "Sales & Contracts";
  if (key.includes("subscription")) return "Sales & Contracts";
  if (key.includes("finance")) return "Billing & Finance";
  if (key.includes("delivery")) return "Delivery & Service";
  if (key.includes("return") || key.includes("reversal")) return "Returns & Reversals";
  if (key.includes("inventory") || key.includes("product")) return "Inventory";
  if (key.includes("lucky")) return "Lucky Plan";
  if (key.includes("crm") || key.includes("partner")) return "CRM & Partners";
  if (key.includes("report") || key.includes("audit")) return "Reports & Audit";
  if (key.includes("setup") || key.includes("staff")) return "Setup";
  return title;
}

function inferAdminBadgeSource(item: AdminRouteRegistryItem): string | undefined {
  const href = item.href.toLowerCase();
  const label = item.label.toLowerCase();
  if (href.includes("/outstandings")) return "admin.badges.outstanding_count";
  if (href.includes("/overdue")) return "admin.badges.overdue_count";
  if (href.includes("/deliver")) return "admin.badges.pending_delivery_count";
  if (label.includes("return") || label.includes("reversal")) return "admin.badges.pending_reversal_count";
  if (label.includes("refund")) return "admin.badges.pending_refund_count";
  if (href.includes("/support") || href.includes("/service-desk")) return "admin.badges.open_support_ticket_count";
  if (label.includes("low stock")) return "admin.badges.low_stock_count";
  if (href.includes("/draw") || href.includes("/batch")) return "admin.badges.pending_draw_count";
  if (href.includes("/reconciliation")) return "admin.badges.unreconciled_count";
  return item.badgeSource;
}

function buildAdminNavigationGroups(): NavGroup[] {
  const grouped = new Map<string, NavItem[]>();
  const toNavItem = (row: AdminRouteRegistryItem): NavItem => ({
    label: row.label,
    href: row.href,
    icon: iconForGroup(row.group),
    disabled: row.status === "deferred",
    description: row.description,
    badgeSource: inferAdminBadgeSource(row),
    children: row.children?.map(toNavItem),
  });

  ADMIN_ROUTE_TREE.forEach((row) => {
    if (/^create\s/i.test(row.label)) return;
    const groupTitle = normalizeAdminGroupTitle(row.group);
    if (!grouped.has(groupTitle)) grouped.set(groupTitle, []);
    grouped.get(groupTitle)!.push(toNavItem(row));
  });
  return Array.from(grouped.entries()).map(([title, items]) => ({
    title,
    icon: iconForGroup(title),
    items,
  }));
}

export const groupedNavigationByRole: Record<NavigationRole, NavGroup[]> = {
  ADMIN: buildAdminNavigationGroups(),

  PARTNER: [
    {
      title: "Dashboard",
      icon: "dashboard",
      items: [
        {
          label: "Dashboard",
          href: ROUTES.partner.dashboard,
          icon: "dashboard",
        },
      ],
    },
    {
      title: "My Customers",
      icon: "customers",
      items: [
        {
          label: "My Customers",
          href: ROUTES.partner.customers,
          icon: "customers",
        },
      ],
    },
    {
      title: "Leads",
      icon: "leads",
      items: [
        {
          label: "Leads",
          href: ROUTES.partner.subscriptionRequests,
          icon: "leads",
        },
      ],
    },
    {
      title: "Commissions",
      icon: "collections",
      items: [
        {
          label: "Commissions",
          href: ROUTES.partner.commissions,
          icon: "commissions",
        },
      ],
    },
    {
      title: "Payouts",
      icon: "payoutBatches",
      items: [
        {
          label: "Payouts",
          href: ROUTES.partner.payouts,
          icon: "payoutBatches",
        },
      ],
    },
    {
      title: "Statements",
      icon: "reports",
      items: [
        {
          label: "Statements",
          href: ROUTES.partner.reports,
          icon: "reports",
        },
      ],
    },
    {
      title: "Support",
      icon: "support",
      items: [
        {
          label: "Notifications",
          href: ROUTES.partner.notifications,
          icon: "reminders",
        },
      ],
    },
  ],

  CUSTOMER: [
    {
      title: "Dashboard",
      icon: "home",
      items: [
        {
          label: "Dashboard",
          href: ROUTES.customer.dashboard,
          icon: "home",
        },
      ],
    },
    {
      title: "My Contracts",
      icon: "subscriptions",
      items: [
        {
          label: "My Contracts",
          href: ROUTES.customer.subscriptions,
          icon: "subscriptions",
        },
      ],
    },
    {
      title: "Payments & Receipts",
      icon: "payments",
      items: [
        {
          label: "Payments & Receipts",
          href: ROUTES.customer.payments,
          icon: "payments",
        },
      ],
    },
    {
      title: "Delivery",
      icon: "deliveries",
      items: [
        {
          label: "Delivery",
          href: ROUTES.customer.deliveries,
          icon: "deliveries",
        },
      ],
    },
    {
      title: "Support",
      icon: "support",
      items: [
        {
          label: "Support",
          href: ROUTES.customer.support,
          icon: "support",
        },
        {
          label: "Returns / Service",
          href: ROUTES.customer.support,
          icon: "serviceDesk",
        },
        {
          label: "Lucky Draw",
          href: ROUTES.customer.subscriptions,
          icon: "luckyDraws",
        },
        {
          label: "Notifications",
          href: ROUTES.customer.notifications,
          icon: "reminders",
        },
      ],
    },
    {
      title: "Profile",
      icon: "profile",
      items: [
        {
          label: "Profile",
          href: ROUTES.customer.profile,
          icon: "profile",
        },
      ],
    },
  ],

  CASHIER: [
    {
      title: "Dashboard",
      icon: "dashboard",
      items: [
        {
          label: "Dashboard",
          href: ROUTES.cashier.dashboard,
          icon: "dashboard",
        },
        {
          label: "Notifications",
          href: ROUTES.cashier.notifications,
          icon: "reminders",
        },
      ],
    },
    {
      title: "Collection Workflows",
      icon: "cashCounter",
      items: [
        {
          label: "Collect Subscription / Direct Sale",
          href: `${ROUTES.cashier.collect}?workflow=unified`,
          icon: "collectPayment",
        },
      ],
    },
    {
      title: "Receipts",
      icon: "payments",
      items: [
        {
          label: "Payment History",
          href: ROUTES.cashier.payments,
          icon: "payments",
        },
      ],
    },
  ],
  VENDOR: [
    {
      title: "Vendor Portal",
      items: [
        { label: "Dashboard", href: "/vendor", icon: "dashboard", description: "Vendor operational dashboard." },
        { label: "Notifications", href: "/vendor/notifications", icon: "reminders", description: "Role-safe vendor alerts." },
        { label: "Profile", href: "/vendor/profile", icon: "crm", description: "Vendor profile and service areas." },
        { label: "Quote Requests", href: "/vendor/quotes", icon: "billing", description: "Quote requests and submissions." },
        { label: "Purchase Orders", href: "/vendor/orders", icon: "procurement", description: "Purchase order visibility." },
        { label: "Ledger", href: "/vendor/ledger", icon: "accounting", description: "Vendor ledger entries." },
        { label: "Outstanding", href: "/vendor/outstanding", icon: "finance", description: "Vendor outstanding balance." },
        { label: "Purchase Returns", href: "/vendor/purchase-returns", icon: "serviceDesk", description: "Purchase return visibility." },
        { label: "Products", href: "/vendor/products", icon: "inventory", description: "Vendor product catalog." },
        { label: "Documents", href: "/vendor/documents", icon: "reports", description: "Vendor documents and uploads." },
      ],
    },
  ],
};

export const navigationByRole: Record<NavigationRole, NavItem[]> = {
  ADMIN: flattenGroups(groupedNavigationByRole.ADMIN),
  PARTNER: flattenGroups(groupedNavigationByRole.PARTNER),
  CUSTOMER: flattenGroups(groupedNavigationByRole.CUSTOMER),
  CASHIER: flattenGroups(groupedNavigationByRole.CASHIER),
  VENDOR: flattenGroups(groupedNavigationByRole.VENDOR),
};

export function normalizeRole(role: string | null | undefined): NavigationRole {
  const normalized = (role || "").trim().toUpperCase();

  switch (normalized) {
    case "ADMIN":
      return "ADMIN";
    case "PARTNER":
      return "PARTNER";
    case "CUSTOMER":
      return "CUSTOMER";
    case "CASHIER":
      return "CASHIER";
    case "VENDOR":
      return "VENDOR";
    default:
      return "CUSTOMER";
  }
}

export function getNavigationForRole(role: string | null | undefined): NavItem[] {
  return navigationByRole[normalizeRole(role)];
}

export function getNavigationGroupsForRole(
  role: string | null | undefined
): NavGroup[] {
  return groupedNavigationByRole[normalizeRole(role)];
}

// ------------------------------------------------------------------------------------
// Legacy exports (kept for backward compatibility in imports inside the repo).
// ------------------------------------------------------------------------------------
// The exports below were previously defined at the end of this module.
// They remain here with identical names, but the navigation groups are now
// business-oriented and role-aligned for daily operations use.
//
// ------------------------------------------------------------------------------------
//
// NOTE: Keep new exports above this comment.
//
// ------------------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __NAVIGATION_MIGRATION_NOTICE__ = "Navigation registry was reorganized (non-breaking).";
