import { ROUTES } from "@/lib/routes";

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

function adminParentModule(
  label: string,
  href: string,
  icon: NavIconKey,
  description: string,
  badgeSource?: string,
): NavItem {
  return { label, href, icon, description, badgeSource };
}

export const ADMIN_PARENT_NAVIGATION: NavGroup[] = [
  {
    title: "ERP Modules",
    icon: "dashboard",
    items: [
      adminParentModule(
        "Command Center",
        ROUTES.admin.dashboard,
        "dashboard",
        "Daily dashboard, today's work, operations command center, BI, alerts, and global search.",
      ),
      adminParentModule(
        "Sales & Contracts",
        ROUTES.admin.salesWorkspace,
        "billing",
        "Sales workspace for invoices, receipts, customer contracts, and handoff controls.",
      ),
      adminParentModule(
        "Subscription EMI",
        ROUTES.admin.subscriptions,
        "subscriptions",
        "Advance EMI cockpit for batches, Lucky IDs, EMI schedules, payments, draws, waivers, and amendments.",
        "queue.subscription_requests_pending",
      ),
      adminParentModule(
        "Rent / Lease",
        ROUTES.admin.rentLease,
        "subscriptions",
        "Rent and lease cockpit for contracts, deposits, monthly demands, possession, inspections, and returns.",
      ),
      adminParentModule(
        "Direct Sale",
        ROUTES.admin.billingDirectSaleWorkspace,
        "billing",
        "Direct-sale billing cockpit for retail sale, invoice, receipt, collection, delivery, and return workflows.",
      ),
      adminParentModule(
        "Accounting & Finance",
        ROUTES.admin.accounting,
        "accounting",
        "Finance cockpit for accounting setup, collections, journals, reconciliation, reports, GST, ITR, payables, and payouts.",
        "admin.badges.unreconciled_count",
      ),
      adminParentModule(
        "Inventory",
        ROUTES.admin.inventory,
        "inventory",
        "Inventory cockpit for stock, locations, adjustments, purchase needs, returns, quality holds, and stock ledger.",
        "admin.badges.low_stock_count",
      ),
      adminParentModule(
        "Manufacturing",
        ROUTES.admin.manufacturing,
        "manufacturing",
        "Manufacturing cockpit for BOMs, production jobs, production consumption/output, and costing.",
      ),
      adminParentModule(
        "CRM / Parties",
        ROUTES.admin.crmWorkspace,
        "crm",
        "Party cockpit for customers, vendors, partners, interactions, KYC, leads, and customer 360.",
        "admin.badges.open_support_ticket_count",
      ),
      adminParentModule(
        "HR & Staff",
        ROUTES.admin.hr,
        "payroll",
        "HR cockpit for staff, roles, attendance, salary, payroll, expenses, and permissions.",
      ),
      adminParentModule(
        "Service Desk",
        ROUTES.admin.serviceDesk,
        "serviceDesk",
        "Service cockpit for cases, support tickets, returns, damaged returns, and follow-up controls.",
        "admin.badges.open_support_ticket_count",
      ),
      adminParentModule(
        "Delivery & Operations",
        ROUTES.admin.deliveries,
        "deliveries",
        "Delivery cockpit for delivery cases, handover, documents, return logistics, and operational dispatch.",
        "admin.badges.pending_delivery_count",
      ),
      adminParentModule(
        "Reports & Analysis",
        ROUTES.admin.reports,
        "reports",
        "Reports cockpit for BI, accounting reports, operational reports, and reconciliation analysis.",
      ),
      adminParentModule(
        "Settings",
        ROUTES.admin.settings,
        "settings",
        "Settings cockpit for setup readiness, business profile, branding, branches, counters, accounting setup, and backups.",
      ),
    ],
  },
];

export const groupedNavigationByRole: Record<NavigationRole, NavGroup[]> = {
  ADMIN: ADMIN_PARENT_NAVIGATION,

  PARTNER: [
    { title: "Dashboard", icon: "dashboard", items: [{ label: "Dashboard", href: ROUTES.partner.dashboard, icon: "dashboard" }] },
    { title: "My Customers", icon: "customers", items: [{ label: "My Customers", href: ROUTES.partner.customers, icon: "customers" }] },
    { title: "Contract Amendments", icon: "subscriptions", items: [{ label: "Customer amendment requests", href: ROUTES.partner.contractAmendments, icon: "subscriptions" }] },
    { title: "Leads", icon: "leads", items: [{ label: "Leads", href: ROUTES.partner.subscriptionRequests, icon: "leads" }] },
    { title: "Commissions", icon: "collections", items: [{ label: "Commissions", href: ROUTES.partner.commissions, icon: "commissions" }] },
    { title: "Payouts", icon: "payoutBatches", items: [{ label: "Payouts", href: ROUTES.partner.payouts, icon: "payoutBatches" }] },
    { title: "Statements", icon: "reports", items: [{ label: "Statements", href: ROUTES.partner.reports, icon: "reports" }] },
    { title: "Support", icon: "support", items: [{ label: "Support", href: ROUTES.partner.notifications, icon: "support" }] },
    { title: "Profile", icon: "profile", items: [{ label: "Profile", href: ROUTES.partner.dashboard, icon: "profile" }] },
  ],

  CUSTOMER: [
    { title: "Dashboard", icon: "home", items: [{ label: "Dashboard", href: ROUTES.customer.dashboard, icon: "home" }] },
    {
      title: "My Contracts",
      icon: "subscriptions",
      items: [
        { label: "My Contracts", href: ROUTES.customer.subscriptions, icon: "subscriptions" },
        { label: "My amendment requests", href: ROUTES.customer.contractAmendments, icon: "subscriptions" },
      ],
    },
    { title: "Payments & Receipts", icon: "payments", items: [{ label: "Payments & Receipts", href: ROUTES.customer.payments, icon: "payments" }] },
    { title: "Delivery", icon: "deliveries", items: [{ label: "Delivery", href: ROUTES.customer.deliveries, icon: "deliveries" }] },
    {
      title: "Support",
      icon: "support",
      items: [
        { label: "Support", href: ROUTES.customer.support, icon: "support" },
        { label: "Returns / Service", href: ROUTES.customer.support, icon: "serviceDesk" },
        { label: "Lucky Draw", href: ROUTES.customer.subscriptions, icon: "luckyDraws" },
        { label: "Notifications", href: ROUTES.customer.notifications, icon: "reminders" },
      ],
    },
    { title: "Profile", icon: "profile", items: [{ label: "Profile", href: ROUTES.customer.profile, icon: "profile" }] },
  ],

  CASHIER: [
    { title: "Cashier Dashboard", icon: "dashboard", items: [{ label: "Dashboard", href: ROUTES.cashier.dashboard, icon: "dashboard" }] },
    { title: "Customer Search", icon: "cashCounter", items: [{ label: "Customer Search", href: ROUTES.cashier.collect, icon: "customers" }] },
    {
      title: "Collections",
      icon: "collections",
      items: [
        { label: "Collections", href: `${ROUTES.cashier.collect}?workflow=unified`, icon: "collectPayment" },
        { label: "Collection Control Center", href: ROUTES.cashier.collectionControlCenter, icon: "collections" },
        { label: "Direct-Sale Collection", href: `${ROUTES.cashier.collect}?workflow=direct-sale`, icon: "billing" },
        { label: "EMI Collection", href: `${ROUTES.cashier.collect}?workflow=advance-emi`, icon: "emis" },
      ],
    },
    {
      title: "Receipts",
      icon: "payments",
      items: [
        { label: "Payment History", href: ROUTES.cashier.payments, icon: "payments" },
        { label: "Cash Closing", href: ROUTES.cashier.dayClose, icon: "cashCounter" },
      ],
    },
    { title: "Support", icon: "support", items: [{ label: "Notifications", href: ROUTES.cashier.notifications, icon: "reminders" }] },
  ],

  VENDOR: [
    { title: "Dashboard", items: [{ label: "Dashboard", href: ROUTES.vendor.dashboard, icon: "dashboard", description: "Vendor operational dashboard." }] },
    { title: "Quote Requests", items: [{ label: "Quote Requests", href: ROUTES.vendor.quotes, icon: "billing", description: "Quote requests and submissions." }] },
    { title: "Purchase Orders", items: [{ label: "Purchase Orders", href: ROUTES.vendor.orders, icon: "procurement", description: "Purchase order visibility." }] },
    { title: "Ledger", items: [{ label: "Ledger", href: ROUTES.vendor.ledger, icon: "accounting", description: "Vendor ledger entries." }] },
    { title: "Outstanding", items: [{ label: "Outstanding", href: ROUTES.vendor.outstanding, icon: "finance", description: "Vendor outstanding balance." }] },
    { title: "Purchase Returns", items: [{ label: "Purchase Returns", href: ROUTES.vendor.purchaseReturns, icon: "serviceDesk", description: "Purchase return visibility." }] },
    { title: "Products", items: [{ label: "Products", href: ROUTES.vendor.products, icon: "inventory", description: "Vendor product catalog." }] },
    { title: "Documents", items: [{ label: "Documents", href: ROUTES.vendor.documents, icon: "reports", description: "Vendor documents and uploads." }] },
    { title: "Support", items: [{ label: "Notifications", href: ROUTES.vendor.notifications, icon: "reminders", description: "Role-safe vendor alerts." }] },
    { title: "Profile", items: [{ label: "Profile", href: ROUTES.vendor.profile, icon: "crm", description: "Vendor profile and service areas." }] },
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

export function getNavigationGroupsForRole(role: string | null | undefined): NavGroup[] {
  return groupedNavigationByRole[normalizeRole(role)];
}

// ------------------------------------------------------------------------------------
// Legacy exports (kept for backward compatibility in imports inside the repo).
// ------------------------------------------------------------------------------------
// The exports below were previously defined at the end of this module.
// They remain here with identical names, but the navigation groups are now
// business-oriented and role-aligned for daily operations use.
// ------------------------------------------------------------------------------------
