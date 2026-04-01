import { ROUTES } from "@/lib/routes";

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
      title: "Overview",
      items: [
        {
          label: "Dashboard",
          href: ROUTES.admin.dashboard,
          icon: "dashboard",
        },
        {
          label: "Analytics",
          href: ROUTES.admin.analytics,
          icon: "analytics",
        },
      ],
    },
    {
      title: "Operations",
      items: [
        {
          label: "Collections",
          href: ROUTES.admin.collections,
          icon: "collections",
        },
        {
          label: "Leads",
          href: ROUTES.admin.leads,
          icon: "leads",
        },
        {
          label: "Support Issues",
          href: ROUTES.admin.supportRequests,
          icon: "support",
        },
        {
          label: "Customers",
          href: ROUTES.admin.customers,
          icon: "customers",
        },
        {
          label: "Deliveries",
          href: ROUTES.admin.deliveries,
          icon: "deliveries",
        },
        {
          label: "Products",
          href: ROUTES.admin.products,
          icon: "products",
        },
        {
          label: "Subscriptions",
          href: ROUTES.admin.subscriptions,
          icon: "subscriptions",
        },
        {
          label: "Payments",
          href: ROUTES.admin.payments,
          icon: "payments",
        },
        {
          label: "EMI",
          href: ROUTES.admin.emis,
          icon: "emis",
        },
        {
          label: "Batches",
          href: ROUTES.admin.batches,
          icon: "batches",
        },
        {
          label: "Partners",
          href: ROUTES.admin.partners,
          icon: "partners",
        },
      ],
    },
    {
      title: "Lucky Plan Control",
      items: [
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
      title: "Finance",
      items: [
        {
          label: "Finance Overview",
          href: ROUTES.admin.finance,
          icon: "finance",
        },
        {
          label: "Commission Reconciliation",
          href: ROUTES.admin.financeReconciliation,
          icon: "reconciliation",
        },
        {
          label: "Payment Reconciliation",
          href: ROUTES.admin.paymentReconciliation,
          icon: "payments",
        },
        {
          label: "Commission Finance",
          href: ROUTES.admin.financeCommissions,
          icon: "commissions",
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
      title: "Controls",
      items: [
        {
          label: "Audit Logs",
          href: ROUTES.admin.auditLogs,
          icon: "auditLogs",
        },
        {
          label: "Reports",
          href: ROUTES.admin.reports,
          icon: "reports",
        },
        {
          label: "Settings",
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
