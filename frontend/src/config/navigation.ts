import { ROUTES } from "@/lib/routes";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";

export type NavigationRole = "ADMIN" | "PARTNER" | "CUSTOMER" | "CASHIER";

export type NavIconKey =
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
  | "collectPayment"
  | "payments";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIconKey;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

function flattenGroups(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items);
}

export const groupedNavigationByRole: Record<NavigationRole, NavGroup[]> = {
  ADMIN: [
    {
      title: "Control Center",
      items: [
        {
          label: "Workspace",
          href: ROUTES.admin.dashboard,
          icon: "dashboard",
        },
        {
          label: "Analytics",
          href: ROUTES.admin.analytics,
          icon: "analytics",
        },
        {
          label: "Operations Reports",
          href: ROUTES.admin.reports,
          icon: "reports",
        },
        {
          label: "Support Issues",
          href: ROUTES.admin.supportRequests,
          icon: "support",
        },
      ],
    },
    {
      title: "Sales & Onboarding",
      items: [
        {
          label: "Leads",
          href: ROUTES.admin.leads,
          icon: "leads",
        },
        {
          label: "Contract Requests",
          href: ROUTES.admin.subscriptionRequests,
          icon: "subscriptions",
        },
        {
          label: "Customers",
          href: ROUTES.admin.customers,
          icon: "customers",
        },
        {
          label: "Subscriptions",
          href: ROUTES.admin.subscriptions,
          icon: "subscriptions",
        },
      ],
    },
    {
      title: "Collections & EMI",
      items: [
        {
          label: "Collections",
          href: ROUTES.admin.collections,
          icon: "collections",
        },
        {
          label: "Payments",
          href: ROUTES.admin.payments,
          icon: "payments",
        },
        {
          label: "EMI Register",
          href: ROUTES.admin.emis,
          icon: "emis",
        },
        {
          label: "Reminders",
          href: ROUTES.admin.reminders,
          icon: "support",
        },
        {
          label: "Reconciliation",
          href: buildAdminReconciliationRoute(),
          icon: "reconciliation",
        },
      ],
    },
    {
      title: "Fulfillment",
      items: [
        {
          label: "Deliveries",
          href: ROUTES.admin.deliveries,
          icon: "deliveries",
        },
        {
          label: "Lucky IDs",
          href: ROUTES.admin.luckyIds,
          icon: "luckyIds",
        },
        {
          label: "Lucky Draws",
          href: ROUTES.admin.luckyDraws,
          icon: "luckyDraws",
        },
      ],
    },
    {
      title: "Catalog & Inventory",
      items: [
        {
          label: "Product Master",
          href: ROUTES.admin.products,
          icon: "products",
        },
        {
          label: "Inventory Control",
          href: ROUTES.admin.inventory,
          icon: "products",
        },
        {
          label: "Batch Control",
          href: ROUTES.admin.batches,
          icon: "batches",
        },
      ],
    },
    {
      title: "Partner Finance",
      items: [
        {
          label: "Partners",
          href: ROUTES.admin.partners,
          icon: "partners",
        },
        {
          label: "Commission Finance",
          href: ROUTES.admin.financeCommissions,
          icon: "commissions",
        },
        {
          label: "Commission Reconciliation",
          href: ROUTES.admin.financeReconciliation,
          icon: "reconciliation",
        },
        {
          label: "Payout Queue",
          href: ROUTES.admin.financeSettledCommissions,
          icon: "settledCommissions",
        },
        {
          label: "Payout Batches",
          href: ROUTES.admin.financePayoutBatches,
          icon: "payoutBatches",
        },
      ],
    },
    {
      title: "Billing & Accounting",
      items: [
        {
          label: "Billing Documents",
          href: ROUTES.admin.billing,
          icon: "payments",
        },
        {
          label: "Books & Accounting",
          href: ROUTES.admin.accounting,
          icon: "finance",
        },
      ],
    },
    {
      title: "Governance",
      items: [
        {
          label: "Audit Logs",
          href: ROUTES.admin.auditLogs,
          icon: "auditLogs",
        },
        {
          label: "Settings & Controls",
          href: ROUTES.admin.settings,
          icon: "settings",
        },
      ],
    },
  ],

  PARTNER: [
    {
      title: "Overview",
      items: [
        {
          label: "Dashboard",
          href: ROUTES.partner.dashboard,
          icon: "dashboard",
        },
      ],
    },
    {
      title: "Operations",
      items: [
        {
          label: "Collections",
          href: ROUTES.partner.collections,
          icon: "collections",
        },
        {
          label: "Subscription Requests",
          href: ROUTES.partner.subscriptionRequests,
          icon: "subscriptions",
        },
        {
          label: "Customers",
          href: ROUTES.partner.customers,
          icon: "customers",
        },
        {
          label: "Subscriptions",
          href: ROUTES.partner.subscriptions,
          icon: "subscriptions",
        },
        {
          label: "Payments",
          href: ROUTES.partner.payments,
          icon: "payments",
        },
      ],
    },
    {
      title: "Finance",
      items: [
        {
          label: "Commissions",
          href: ROUTES.partner.commissions,
          icon: "commissions",
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
      title: "Overview",
      items: [
        {
          label: "Dashboard",
          href: ROUTES.customer.dashboard,
          icon: "home",
        },
      ],
    },
    {
      title: "My Account",
      items: [
        {
          label: "Subscriptions",
          href: ROUTES.customer.subscriptions,
          icon: "subscriptions",
        },
        {
          label: "Subscription Requests",
          href: ROUTES.customer.subscriptionRequests,
          icon: "subscriptions",
        },
        {
          label: "Deliveries",
          href: ROUTES.customer.deliveries,
          icon: "deliveries",
        },
        {
          label: "Payments",
          href: ROUTES.customer.payments,
          icon: "payments",
        },
        {
          label: "Profile",
          href: ROUTES.customer.profile,
          icon: "profile",
        },
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
      title: "Overview",
      items: [
        {
          label: "Dashboard",
          href: ROUTES.cashier.dashboard,
          icon: "dashboard",
        },
        {
          label: "Collect Payment",
          href: ROUTES.cashier.collect,
          icon: "collectPayment",
        },
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
