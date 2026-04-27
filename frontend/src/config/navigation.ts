import { ROUTES } from "@/lib/routes";
import { ADMIN_ROUTE_REGISTRY } from "@/config/admin-route-registry";

export type NavigationRole = "ADMIN" | "PARTNER" | "CUSTOMER" | "CASHIER";

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
};

export type NavGroup = {
  title: string;
  icon?: NavIconKey;
  items: NavItem[];
};

function flattenGroups(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items);
}

function iconForGroup(group: string): NavIconKey {
  const key = group.toLowerCase();
  if (key.includes("command")) return "dashboard";
  if (key.includes("customer")) return "crm";
  if (key.includes("contract")) return "subscriptions";
  if (key.includes("partner")) return "partners";
  if (key.includes("billing")) return "finance";
  return "operations";
}

function buildAdminNavigationGroups(): NavGroup[] {
  const grouped = new Map<string, NavItem[]>();
  ADMIN_ROUTE_REGISTRY.forEach((row) => {
    if (!grouped.has(row.group)) grouped.set(row.group, []);
    grouped.get(row.group)!.push({
      label: row.label,
      href: row.href,
      icon: iconForGroup(row.group),
      disabled: row.status === "deferred",
      description: row.description,
      badgeSource: row.badgeSource,
    });
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
      title: "Overview",
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
      title: "Customers",
      icon: "customers",
      items: [
        {
          label: "Customers",
          href: ROUTES.partner.customers,
          icon: "customers",
        },
      ],
    },
    {
      title: "Subscriptions",
      icon: "subscriptions",
      items: [
        {
          label: "Subscriptions",
          href: ROUTES.partner.subscriptions,
          icon: "subscriptions",
        },
      ],
    },
    {
      title: "Collections",
      icon: "collections",
      items: [
        {
          label: "Collections",
          href: ROUTES.partner.collections,
          icon: "collections",
        },
        {
          label: "Payments",
          href: ROUTES.partner.payments,
          icon: "payments",
        },
      ],
    },
    {
      title: "Commissions",
      icon: "commissions",
      items: [
        {
          label: "Commissions",
          href: ROUTES.partner.commissions,
          icon: "commissions",
        },
      ],
    },
    {
      title: "Support",
      icon: "support",
      items: [
        {
          label: "Subscription Requests",
          href: ROUTES.partner.subscriptionRequests,
          icon: "support",
        },
        {
          label: "Reports",
          href: ROUTES.partner.reports,
          icon: "reports",
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
      title: "My Plan",
      icon: "subscriptions",
      items: [
        {
          label: "Subscriptions",
          href: ROUTES.customer.subscriptions,
          icon: "subscriptions",
        },
      ],
    },
    {
      title: "Payments",
      icon: "payments",
      items: [
        {
          label: "Payments",
          href: ROUTES.customer.payments,
          icon: "payments",
        },
      ],
    },
    {
      title: "Winner Status",
      icon: "luckyDraws",
      items: [
        {
          label: "Plan Requests",
          href: ROUTES.customer.subscriptionRequests,
          icon: "luckyDraws",
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
    {
      title: "Support",
      icon: "support",
      items: [
        {
          label: "Support",
          href: ROUTES.customer.support,
          icon: "support",
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
      ],
    },
    {
      title: "Collection Workflows",
      icon: "cashCounter",
      items: [
        {
          label: "Collect Subscription / Direct Sale",
          href: ROUTES.cashier.collect,
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
};

export const navigationByRole: Record<NavigationRole, NavItem[]> = {
  ADMIN: flattenGroups(groupedNavigationByRole.ADMIN),
  PARTNER: flattenGroups(groupedNavigationByRole.PARTNER),
  CUSTOMER: flattenGroups(groupedNavigationByRole.CUSTOMER),
  CASHIER: flattenGroups(groupedNavigationByRole.CASHIER),
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
