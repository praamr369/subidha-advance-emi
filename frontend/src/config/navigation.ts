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
      title: "Lucky Plan Operations",
      icon: "operations",
      items: [
        {
          label: "Overview",
          href: ROUTES.admin.dashboard,
          icon: "dashboard",
        },
        {
          label: "Subscriptions",
          href: ROUTES.admin.subscriptions,
          icon: "subscriptions",
        },
        {
          label: "EMI Register",
          href: ROUTES.admin.emis,
          icon: "emis",
        },
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
          label: "Batches",
          href: ROUTES.admin.batches,
          icon: "batches",
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
        {
          label: "Reminders",
          href: ROUTES.admin.reminders,
          icon: "reminders",
        },
        {
          label: "Reconciliation",
          href: buildAdminReconciliationRoute(),
          icon: "reconciliation",
        },
      ],
    },
    {
      title: "CRM & Parties",
      icon: "crm",
      items: [
        {
          label: "CRM Overview",
          href: ROUTES.admin.crm,
          icon: "leads",
        },
        {
          label: "Leads",
          href: ROUTES.admin.crmLeads,
          icon: "leads",
        },
        {
          label: "Party Directory",
          href: ROUTES.admin.crmParties,
          icon: "customers",
        },
        {
          label: "Customers",
          href: ROUTES.admin.customers,
          icon: "customers",
        },
        {
          label: "Subscription Requests",
          href: ROUTES.admin.subscriptionRequests,
          icon: "subscriptions",
        },
        {
          label: "Customer Support",
          href: ROUTES.admin.supportRequests,
          icon: "support",
        },
      ],
    },
    {
      title: "Direct Sales & Billing",
      icon: "billing",
      items: [
        {
          label: "Billing Cockpit",
          href: ROUTES.admin.billing,
          icon: "payments",
        },
        {
          label: "Direct Sales",
          href: ROUTES.admin.billingDirectSales,
          icon: "collections",
        },
        {
          label: "Billing Register",
          href: ROUTES.admin.billingRegister,
          icon: "reports",
        },
        {
          label: "Invoices",
          href: ROUTES.admin.billingInvoices,
          icon: "payments",
        },
        {
          label: "Receipts",
          href: ROUTES.admin.billingReceipts,
          icon: "payments",
        },
        {
          label: "Contract Mirrors",
          href: ROUTES.admin.billingContracts,
          icon: "subscriptions",
        },
        {
          label: "Credit Notes",
          href: ROUTES.admin.billingCreditNotes,
          icon: "reconciliation",
        },
        {
          label: "Debit Notes",
          href: ROUTES.admin.billingDebitNotes,
          icon: "reconciliation",
        },
      ],
    },
    {
      title: "Inventory & Procurement",
      icon: "inventory",
      items: [
        {
          label: "Product Catalog",
          href: ROUTES.admin.products,
          icon: "products",
        },
        {
          label: "Inventory Overview",
          href: ROUTES.admin.inventory,
          icon: "products",
        },
        {
          label: "Inventory Items",
          href: ROUTES.admin.inventoryItems,
          icon: "products",
        },
        {
          label: "Stock Locations",
          href: ROUTES.admin.inventoryLocations,
          icon: "deliveries",
        },
        {
          label: "Stock Ledger",
          href: ROUTES.admin.inventoryLedger,
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
      ],
    },
    {
      title: "Manufacturing",
      icon: "manufacturing",
      items: [
        {
          label: "Overview",
          href: ROUTES.admin.manufacturing,
          icon: "products",
        },
        {
          label: "BOM Register",
          href: ROUTES.admin.manufacturingBoms,
          icon: "reports",
        },
        {
          label: "Production Jobs",
          href: ROUTES.admin.manufacturingJobs,
          icon: "products",
        },
      ],
    },
    {
      title: "Service Desk",
      icon: "serviceDesk",
      items: [
        {
          label: "Overview",
          href: ROUTES.admin.serviceDesk,
          icon: "support",
        },
        {
          label: "Complaints",
          href: ROUTES.admin.serviceDeskComplaints,
          icon: "support",
        },
        {
          label: "Returns",
          href: ROUTES.admin.serviceDeskReturns,
          icon: "reconciliation",
        },
        {
          label: "Service Tickets",
          href: ROUTES.admin.serviceDeskTickets,
          icon: "support",
        },
      ],
    },
    {
      title: "Accounting & Finance",
      icon: "accounting",
      items: [
        {
          label: "Accounting Overview",
          href: ROUTES.admin.accounting,
          icon: "finance",
        },
        {
          label: "Chart of Accounts",
          href: ROUTES.admin.accountingChartOfAccounts,
          icon: "reports",
        },
        {
          label: "Journal Register",
          href: ROUTES.admin.accountingJournals,
          icon: "reports",
        },
        {
          label: "Book Registers",
          href: ROUTES.admin.accountingBooks,
          icon: "finance",
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
          label: "GST Register",
          href: ROUTES.admin.accountingGst,
          icon: "reports",
        },
        {
          label: "Trial Balance",
          href: ROUTES.admin.accountingTrialBalance,
          icon: "reports",
        },
        {
          label: "Profit & Loss",
          href: ROUTES.admin.accountingProfitLoss,
          icon: "analytics",
        },
        {
          label: "Balance Sheet",
          href: ROUTES.admin.accountingBalanceSheet,
          icon: "reports",
        },
        {
          label: "Partners",
          href: ROUTES.admin.partners,
          icon: "partners",
        },
        {
          label: "Commissions",
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
        {
          label: "Accounting Reconciliation",
          href: ROUTES.admin.financeReconciliation,
          icon: "reconciliation",
        },
      ],
    },
    {
      title: "Payroll & Workforce",
      icon: "payroll",
      items: [
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
          label: "Leave Requests",
          href: ROUTES.admin.accountingLeave,
          icon: "support",
        },
        {
          label: "Payroll Register",
          href: ROUTES.admin.accountingSalary,
          icon: "payments",
        },
        {
          label: "Expense Claims",
          href: ROUTES.admin.accountingExpenseClaims,
          icon: "payments",
        },
        {
          label: "Staff Ledger",
          href: ROUTES.admin.accountingStaffLedger,
          icon: "reports",
        },
      ],
    },
    {
      title: "Branches & Counters",
      icon: "branches",
      items: [
        {
          label: "Branches",
          href: ROUTES.admin.branches,
          icon: "settings",
        },
        {
          label: "Cash Counters",
          href: ROUTES.admin.counters,
          icon: "cashCounter",
        },
        {
          label: "Branch Dashboard",
          href: ROUTES.admin.branchReporting,
          icon: "analytics",
        },
      ],
    },
    {
      title: "Reports & Governance",
      icon: "governance",
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
        {
          label: "Audit Logs",
          href: ROUTES.admin.auditLogs,
          icon: "auditLogs",
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
      title: "Collections & Customers",
      icon: "operations",
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
      icon: "finance",
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
      icon: "dashboard",
      items: [
        {
          label: "Dashboard",
          href: ROUTES.customer.dashboard,
          icon: "home",
        },
      ],
    },
    {
      title: "Account & Support",
      icon: "profile",
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
      title: "Counter Operations",
      icon: "cashCounter",
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
