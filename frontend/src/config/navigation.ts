import { ROUTES } from "@/lib/routes";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";

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
};

export type NavGroup = {
  title: string;
  icon?: NavIconKey;
  items: NavItem[];
};

function flattenGroups(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items);
}

export const groupedNavigationByRole: Record<NavigationRole, NavGroup[]> = {
  ADMIN: [
    {
      title: "Executive Overview",
      icon: "dashboard",
      items: [
        {
          label: "Business Control Center",
          href: ROUTES.admin.dashboard,
          icon: "dashboard",
        },
        {
          label: "Operations Workspace",
          href: ROUTES.admin.operations,
          icon: "operations",
        },
        {
          label: "Branch Dashboard",
          href: ROUTES.admin.branchReporting,
          icon: "analytics",
        },
        {
          label: "Analytics",
          href: ROUTES.admin.analytics,
          icon: "analytics",
        },
        {
          label: "Operational Reports",
          href: ROUTES.admin.reports,
          icon: "reports",
        },
      ],
    },
    {
      title: "CRM & Leads",
      icon: "crm",
      items: [
        {
          label: "CRM Overview",
          href: ROUTES.admin.crm,
          icon: "crm",
        },
        {
          label: "Lead Register",
          href: ROUTES.admin.crmLeads,
          icon: "leads",
        },
        {
          label: "Leads (Triage)",
          href: ROUTES.admin.leads,
          icon: "leads",
        },
        {
          label: "Party Directory",
          href: ROUTES.admin.crmParties,
          icon: "customers",
        },
      ],
    },
    {
      title: "Customers",
      icon: "customers",
      items: [
        {
          label: "Customers",
          href: ROUTES.admin.customers,
          icon: "customers",
        },
        {
          label: "Support Requests",
          href: ROUTES.admin.supportRequests,
          icon: "support",
        },
        {
          label: "Service Desk",
          href: ROUTES.admin.serviceDesk,
          icon: "support",
        },
      ],
    },
    {
      title: "Sales & Orders",
      icon: "billing",
      items: [
        {
          label: "Billing Cockpit",
          href: ROUTES.admin.billing,
          icon: "billing",
        },
        {
          label: "Direct Sales",
          href: ROUTES.admin.billingDirectSales,
          icon: "billing",
        },
        {
          label: "Billing Register",
          href: ROUTES.admin.billingRegister,
          icon: "billing",
        },
        {
          label: "Invoices",
          href: ROUTES.admin.billingInvoices,
          icon: "billing",
        },
        {
          label: "Receipts",
          href: ROUTES.admin.billingReceipts,
          icon: "billing",
        },
        {
          label: "Deliveries",
          href: ROUTES.admin.deliveries,
          icon: "deliveries",
        },
      ],
    },
    {
      title: "Subscriptions",
      icon: "subscriptions",
      items: [
        {
          label: "Subscriptions",
          href: ROUTES.admin.subscriptions,
          icon: "subscriptions",
        },
        {
          label: "Rent Contracts",
          href: `${ROUTES.admin.subscriptions}?plan_type=RENT`,
          icon: "subscriptions",
        },
        {
          label: "Lease Contracts",
          href: `${ROUTES.admin.subscriptions}?plan_type=LEASE`,
          icon: "subscriptions",
        },
        {
          label: "Advance EMI Register",
          href: ROUTES.admin.emis,
          icon: "emis",
        },
        {
          label: "Subscription Requests",
          href: ROUTES.admin.subscriptionRequests,
          icon: "subscriptions",
        },
        {
          label: "Batches",
          href: ROUTES.admin.batches,
          icon: "batches",
        },
        {
          label: "Reminders",
          href: ROUTES.admin.reminders,
          icon: "reminders",
        },
      ],
    },
    {
      title: "Finance & Accounts",
      icon: "finance",
      items: [
        {
          label: "Finance Control",
          href: ROUTES.admin.finance,
          icon: "finance",
        },
        {
          label: "Accounting",
          href: ROUTES.admin.accounting,
          icon: "accounting",
        },
        {
          label: "Cash Book",
          href: ROUTES.admin.accountingBooksCash,
          icon: "collections",
        },
        {
          label: "Bank Book",
          href: ROUTES.admin.accountingBooksBank,
          icon: "payments",
        },
        {
          label: "UPI Book",
          href: ROUTES.admin.accountingBooksUpi,
          icon: "payments",
        },
        {
          label: "Commissions",
          href: ROUTES.admin.financeCommissions,
          icon: "commissions",
        },
        {
          label: "Payout Batches",
          href: ROUTES.admin.financePayoutBatches,
          icon: "payoutBatches",
        },
      ],
    },
    {
      title: "Collections & Receivables",
      icon: "collections",
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
          label: "Reconciliation",
          href: buildAdminReconciliationRoute(),
          icon: "reconciliation",
        },
        {
          label: "Overdue Advance EMIs",
          href: ROUTES.admin.emisOverdue,
          icon: "emis",
        },
        {
          label: "Payment Reminders",
          href: ROUTES.admin.remindersPaymentReminders,
          icon: "reminders",
        },
      ],
    },
    {
      title: "Products & Plans",
      icon: "products",
      items: [
        {
          label: "Product Catalog",
          href: ROUTES.admin.products,
          icon: "products",
        },
        {
          label: "Manufacturing",
          href: ROUTES.admin.manufacturing,
          icon: "manufacturing",
        },
      ],
    },
    {
      title: "Inventory",
      icon: "inventory",
      items: [
        {
          label: "Inventory Overview",
          href: ROUTES.admin.inventory,
          icon: "inventory",
        },
        {
          label: "Inventory Items",
          href: ROUTES.admin.inventoryItems,
          icon: "inventory",
        },
        {
          label: "Stock On Hand",
          href: ROUTES.admin.inventoryStockOnHand,
          icon: "inventory",
        },
        {
          label: "Stock Ledger",
          href: ROUTES.admin.inventoryLedger,
          icon: "reports",
        },
        {
          label: "Stock Movements",
          href: ROUTES.admin.inventoryMovements,
          icon: "reports",
        },
        {
          label: "Stock Adjustments",
          href: ROUTES.admin.inventoryAdjustments,
          icon: "reconciliation",
        },
        {
          label: "Opening Stock Import",
          href: ROUTES.admin.inventoryOpeningStock,
          icon: "products",
        },
      ],
    },
    {
      title: "Vendors & Procurement",
      icon: "procurement",
      items: [
        {
          label: "Purchase Register",
          href: ROUTES.admin.accountingPurchaseBills,
          icon: "procurement",
        },
        {
          label: "Vendors",
          href: ROUTES.admin.accountingVendors,
          icon: "partners",
        },
        {
          label: "Vendor Settlements",
          href: ROUTES.admin.accountingVendorSettlements,
          icon: "finance",
        },
      ],
    },
    {
      title: "Branches",
      icon: "branches",
      items: [
        {
          label: "Branches",
          href: ROUTES.admin.branches,
          icon: "branches",
        },
        {
          label: "Cash Counters",
          href: ROUTES.admin.counters,
          icon: "cashCounter",
        },
        {
          label: "Branch Reporting",
          href: ROUTES.admin.branchReporting,
          icon: "analytics",
        },
      ],
    },
    {
      title: "Staff & Roles",
      icon: "payroll",
      items: [
        {
          label: "Users & Roles",
          href: ROUTES.admin.settingsUsers,
          icon: "settings",
        },
        {
          label: "Staff Register",
          href: ROUTES.admin.accountingStaff,
          icon: "customers",
        },
        {
          label: "Attendance",
          href: ROUTES.admin.accountingAttendance,
          icon: "reports",
        },
        {
          label: "Payroll Register",
          href: ROUTES.admin.accountingSalary,
          icon: "payroll",
        },
      ],
    },
    {
      title: "Lucky Draws",
      icon: "luckyDraws",
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
      title: "Reports & Analytics",
      icon: "reports",
      items: [
        {
          label: "Operational Reports",
          href: ROUTES.admin.reports,
          icon: "reports",
        },
        {
          label: "Analytics",
          href: ROUTES.admin.analytics,
          icon: "analytics",
        },
      ],
    },
    {
      title: "Audit & Settings",
      icon: "governance",
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
        {
          label: "Imports",
          href: ROUTES.admin.settingsImports,
          icon: "products",
        },
        {
          label: "Master Registers",
          href: ROUTES.admin.settingsMasters,
          icon: "settings",
        },
      ],
    },
  ],

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
      title: "Search Advance EMI",
      icon: "cashCounter",
      items: [
        {
          label: "Collect Payment",
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
