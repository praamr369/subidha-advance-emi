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

type RoleRouteNamespace = Record<string, string>;

type PartnerRoutes = {
  root: string;
  dashboard: string;
  customers: string;
  subscriptions: string;
  subscriptionRequests: string;
  collectionRequests: string;
  commissions: string;
  payouts: string;
  reports: string;
  notifications: string;
  contractAmendments: string;
};

type CustomerRoutes = {
  root: string;
  dashboard: string;
  subscriptions: string;
  contractAmendments: string;
  payments: string;
  deliveries: string;
  directSales: string;
  support: string;
  supportNew: string;
  notifications: string;
  profile: string;
};

type CashierRoutes = {
  root: string;
  dashboard: string;
  collect: string;
  collectionControlCenter: string;
  payments: string;
  dayClose: string;
  notifications: string;
};

type VendorRoutes = {
  root: string;
  dashboard: string;
  quotes: string;
  orders: string;
  ledger: string;
  outstanding: string;
  purchaseReturns: string;
  products: string;
  documents: string;
  notifications: string;
  profile: string;
};

type RoleRouteNamespaces = {
  partner?: Partial<PartnerRoutes>;
  customer?: Partial<CustomerRoutes>;
  cashier?: Partial<CashierRoutes>;
  vendor?: Partial<VendorRoutes>;
};

function buildRouteNamespace<T extends RoleRouteNamespace>(namespace: Partial<T> | undefined, fallbacks: T): T {
  const merged: RoleRouteNamespace = { ...fallbacks };

  Object.entries(namespace ?? {}).forEach(([key, value]) => {
    if (typeof value === "string" && value.length > 0) {
      merged[key] = value;
    }
  });

  return merged as T;
}

const roleRouteNamespaces = ROUTES as unknown as RoleRouteNamespaces;

const PARTNER_ROUTES = buildRouteNamespace<PartnerRoutes>(roleRouteNamespaces.partner, {
  root: "/partner",
  dashboard: "/partner",
  customers: "/partner/customers",
  subscriptions: "/partner/subscriptions",
  subscriptionRequests: "/partner/subscription-requests",
  collectionRequests: "/partner/collection-requests",
  commissions: "/partner/commissions",
  payouts: "/partner/payouts",
  reports: "/partner/reports",
  notifications: "/partner/notifications",
  contractAmendments: "/partner/contract-amendments",
});

const CUSTOMER_ROUTES = buildRouteNamespace<CustomerRoutes>(roleRouteNamespaces.customer, {
  root: "/customer",
  dashboard: "/customer/dashboard",
  subscriptions: "/customer/subscriptions",
  contractAmendments: "/customer/contract-amendments",
  payments: "/customer/payments",
  deliveries: "/customer/deliveries",
  directSales: "/customer/direct-sales",
  support: "/customer/support",
  supportNew: "/customer/support/new",
  notifications: "/customer/notifications",
  profile: "/customer/profile",
});

const CASHIER_ROUTES = buildRouteNamespace<CashierRoutes>(roleRouteNamespaces.cashier, {
  root: "/cashier",
  dashboard: "/cashier",
  collect: "/cashier/collect",
  collectionControlCenter: "/cashier/collections/control-center",
  payments: "/cashier/payments",
  dayClose: "/cashier/day-close",
  notifications: "/cashier/notifications",
});

const VENDOR_ROUTES = buildRouteNamespace<VendorRoutes>(roleRouteNamespaces.vendor, {
  root: "/vendor",
  dashboard: "/vendor",
  quotes: "/vendor/quotes",
  orders: "/vendor/orders",
  ledger: "/vendor/ledger",
  outstanding: "/vendor/outstanding",
  purchaseReturns: "/vendor/purchase-returns",
  products: "/vendor/products",
  documents: "/vendor/documents",
  notifications: "/vendor/notifications",
  profile: "/vendor/profile",
});

function flattenGroups(groups: NavGroup[]): NavItem[] {
  const flattenItems = (items: NavItem[]): NavItem[] =>
    items.flatMap((item) => [item, ...(item.children ? flattenItems(item.children) : [])]);
  return groups.flatMap((group) => flattenItems(group.items));
}

// Navigation v2 — icon assignments for the 14 canonical business modules.
// Order here controls sidebar group order for ADMIN role.
const ADMIN_MODULE_ICONS: Record<string, NavIconKey> = {
  "Command Center": "dashboard",
  "Profiles & Parties": "customers",
  "CRM & Requests": "crm",
  "Sales & Contracts": "billing",
  "Lucky Plan Control": "luckyDraws",
  "Collections & Cashier": "collectPayment",
  "Finance Operations": "finance",
  "Accounting & Reconciliation": "accounting",
  "Inventory & Stock": "inventory",
  "Purchases & Vendors": "procurement",
  Manufacturing: "manufacturing",
  "Delivery & Service": "deliveries",
  "HR & Staff": "payroll",
  "BI & Reports": "reports",
  "Enterprise Control": "governance",
  "Settings & Governance": "settings",
};

function registryItemToNavItem(row: AdminRouteRegistryItem): NavItem {
  const icon = ADMIN_MODULE_ICONS[row.group] ?? "dashboard";
  return {
    label: row.label,
    href: row.href,
    icon,
    description: row.description,
    badgeSource: row.badgeSource,
    disabled: row.status === "deferred",
    children: row.children?.map(registryItemToNavItem),
  };
}

function buildAdminNavigationGroups(): NavGroup[] {
  const byGroup = ADMIN_ROUTE_TREE.reduce<Map<string, AdminRouteRegistryItem[]>>((acc, row) => {
    const items = acc.get(row.group) ?? [];
    items.push(row);
    acc.set(row.group, items);
    return acc;
  }, new Map());

  return Object.keys(ADMIN_MODULE_ICONS)
    .map((title) => ({
      title,
      icon: ADMIN_MODULE_ICONS[title],
      items: (byGroup.get(title) ?? []).map(registryItemToNavItem),
    }))
    .filter((group) => group.items.length > 0);
}

export const ADMIN_PARENT_NAVIGATION: NavGroup[] = buildAdminNavigationGroups();

export const ADMIN_WORKBENCH_NAVIGATION: NavGroup[] = [
  { title: "Command Center", icon: "dashboard", items: [{ label: "Command Center", href: ROUTES.admin.dashboard, icon: "dashboard", description: "Daily operating snapshot, queues, exceptions, and search." }] },
  { title: "Customer 360", icon: "customers", items: [{ label: "Customer 360", href: ROUTES.admin.customer360, icon: "customers", description: "Customer identity, contracts, collections, delivery, and support context." }] },
  { title: "Revenue", icon: "billing", items: [{ label: "Revenue Workbench", href: ROUTES.admin.revenueWorkbench, icon: "billing", description: "Sales, Lucky Plan, contracts, payments, receipts, and settlements." }] },
  { title: "Inventory & Fulfillment", icon: "inventory", items: [{ label: "Inventory & Fulfillment", href: ROUTES.admin.inventoryFulfillment, icon: "inventory", description: "Products, stock, purchasing, delivery, returns, and service." }] },
  { title: "Finance Control", icon: "finance", items: [{ label: "Finance Control", href: ROUTES.admin.financeControl, icon: "finance", description: "Money controls, reconciliation, accounting, audit, and compliance." }] },
  { title: "CRM & Partners", icon: "crm", items: [{ label: "CRM & Partners", href: ROUTES.admin.crmPartners, icon: "crm", description: "Leads, enquiries, follow-ups, partners, offers, and retention." }] },
  { title: "Operations & People", icon: "operations", items: [{ label: "Operations & People", href: ROUTES.admin.operationsPeople, icon: "operations", description: "Branches, staff, payroll, requests, amendments, and notifications." }] },
  { title: "Reports & Setup", icon: "reports", items: [{ label: "Reports & Setup", href: ROUTES.admin.reportsSetup, icon: "reports", description: "Read-only reporting, users, permissions, setup, and audit." }] },
];

export const groupedNavigationByRole: Record<NavigationRole, NavGroup[]> = {
  ADMIN: ADMIN_WORKBENCH_NAVIGATION,
  PARTNER: [
    { title: "Dashboard", icon: "dashboard", items: [{ label: "Dashboard", href: PARTNER_ROUTES.dashboard, icon: "dashboard" }] },
    { title: "My Customers", icon: "customers", items: [{ label: "My Customers", href: PARTNER_ROUTES.customers, icon: "customers" }] },
    { title: "Contract Amendments", icon: "subscriptions", items: [{ label: "Customer amendment requests", href: PARTNER_ROUTES.contractAmendments, icon: "subscriptions" }] },
    { title: "Leads", icon: "leads", items: [{ label: "Leads", href: PARTNER_ROUTES.subscriptionRequests, icon: "leads" }] },
    { title: "Commissions", icon: "collections", items: [{ label: "Commissions", href: PARTNER_ROUTES.commissions, icon: "commissions" }] },
    { title: "Payouts", icon: "payoutBatches", items: [{ label: "Payouts", href: PARTNER_ROUTES.payouts, icon: "payoutBatches" }] },
    { title: "Statements", icon: "reports", items: [{ label: "Statements", href: PARTNER_ROUTES.reports, icon: "reports" }] },
    { title: "Support", icon: "support", items: [{ label: "Support", href: PARTNER_ROUTES.notifications, icon: "support" }] },
    { title: "Profile", icon: "profile", items: [{ label: "Profile", href: PARTNER_ROUTES.dashboard, icon: "profile" }] },
  ],
  CUSTOMER: [
    { title: "Dashboard", icon: "home", items: [{ label: "Dashboard", href: CUSTOMER_ROUTES.dashboard, icon: "home" }] },
    {
      title: "My Contracts",
      icon: "subscriptions",
      items: [
        { label: "My Contracts", href: CUSTOMER_ROUTES.subscriptions, icon: "subscriptions" },
        { label: "My amendment requests", href: CUSTOMER_ROUTES.contractAmendments, icon: "subscriptions" },
      ],
    },
    { title: "Payments & Receipts", icon: "payments", items: [{ label: "Payments & Receipts", href: CUSTOMER_ROUTES.payments, icon: "payments" }] },
    { title: "Delivery", icon: "deliveries", items: [{ label: "Delivery", href: CUSTOMER_ROUTES.deliveries, icon: "deliveries" }] },
    {
      title: "Support",
      icon: "support",
      items: [
        { label: "Support", href: CUSTOMER_ROUTES.support, icon: "support" },
        { label: "Returns / Service", href: CUSTOMER_ROUTES.support, icon: "serviceDesk" },
        { label: "Lucky Draw", href: CUSTOMER_ROUTES.subscriptions, icon: "luckyDraws" },
        { label: "Notifications", href: CUSTOMER_ROUTES.notifications, icon: "reminders" },
      ],
    },
    { title: "Profile", icon: "profile", items: [{ label: "Profile", href: CUSTOMER_ROUTES.profile, icon: "profile" }] },
  ],
  CASHIER: [
    { title: "Cashier Dashboard", icon: "dashboard", items: [{ label: "Dashboard", href: CASHIER_ROUTES.dashboard, icon: "dashboard" }] },
    { title: "Customer Search", icon: "cashCounter", items: [{ label: "Customer Search", href: CASHIER_ROUTES.collect, icon: "customers" }] },
    {
      title: "Collections",
      icon: "collections",
      items: [
        { label: "Collections", href: `${CASHIER_ROUTES.collect}?workflow=unified`, icon: "collectPayment" },
        { label: "Collection Control Center", href: CASHIER_ROUTES.collectionControlCenter, icon: "collections" },
        { label: "Direct-Sale Collection", href: `${CASHIER_ROUTES.collect}?workflow=direct-sale`, icon: "billing" },
        { label: "EMI Collection", href: `${CASHIER_ROUTES.collect}?workflow=advance-emi`, icon: "emis" },
      ],
    },
    {
      title: "Receipts",
      icon: "payments",
      items: [
        { label: "Payment History", href: CASHIER_ROUTES.payments, icon: "payments" },
        { label: "Cash Closing", href: CASHIER_ROUTES.dayClose, icon: "cashCounter" },
      ],
    },
    { title: "Support", icon: "support", items: [{ label: "Notifications", href: CASHIER_ROUTES.notifications, icon: "reminders" }] },
  ],
  VENDOR: [
    { title: "Dashboard", items: [{ label: "Dashboard", href: VENDOR_ROUTES.dashboard, icon: "dashboard", description: "Vendor operational dashboard." }] },
    { title: "Quote Requests", items: [{ label: "Quote Requests", href: VENDOR_ROUTES.quotes, icon: "billing", description: "Quote requests and submissions." }] },
    { title: "Purchase Orders", items: [{ label: "Purchase Orders", href: VENDOR_ROUTES.orders, icon: "procurement", description: "Purchase order visibility." }] },
    { title: "Ledger", items: [{ label: "Ledger", href: VENDOR_ROUTES.ledger, icon: "accounting", description: "Vendor ledger entries." }] },
    { title: "Outstanding", items: [{ label: "Outstanding", href: VENDOR_ROUTES.outstanding, icon: "finance", description: "Vendor outstanding balance." }] },
    { title: "Purchase Returns", items: [{ label: "Purchase Returns", href: VENDOR_ROUTES.purchaseReturns, icon: "serviceDesk", description: "Purchase return visibility." }] },
    { title: "Products", items: [{ label: "Products", href: VENDOR_ROUTES.products, icon: "inventory", description: "Vendor product catalog." }] },
    { title: "Documents", items: [{ label: "Documents", href: VENDOR_ROUTES.documents, icon: "reports", description: "Vendor documents and uploads." }] },
    { title: "Support", items: [{ label: "Notifications", href: VENDOR_ROUTES.notifications, icon: "reminders", description: "Role-safe vendor alerts." }] },
    { title: "Profile", items: [{ label: "Profile", href: VENDOR_ROUTES.profile, icon: "crm", description: "Vendor profile and service areas." }] },
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
