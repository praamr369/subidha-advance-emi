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

const ADMIN_MODULE_ICONS: Record<string, NavIconKey> = {
  "Command Center": "dashboard",
  "Sales & Contracts": "billing",
  "Rent / Lease": "subscriptions",
  "Accounting & Finance": "accounting",
  Inventory: "inventory",
  "Purchase & Vendors": "procurement",
  Manufacturing: "manufacturing",
  "CRM / Parties": "crm",
  "Service Desk": "serviceDesk",
  "HR & Staff": "payroll",
  "Reports & Analysis": "reports",
  Settings: "settings",
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
