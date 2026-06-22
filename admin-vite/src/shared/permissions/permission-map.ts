export type AppRole = "ADMIN" | "CASHIER" | "STAFF" | "PARTNER" | "VENDOR" | "CUSTOMER";

export type Permission =
  | "dashboard.view"
  | "customers.view"
  | "customers.edit"
  | "products.view"
  | "products.edit"
  | "lucky-plan.view"
  | "lucky-plan.edit"
  | "subscriptions.view"
  | "subscriptions.edit"
  | "payments.view"
  | "payments.collect"
  | "billing.view"
  | "billing.edit"
  | "inventory.view"
  | "inventory.edit"
  | "delivery.view"
  | "delivery.edit"
  | "rent-lease.view"
  | "rent-lease.edit"
  | "accounting.view"
  | "accounting.edit"
  | "reconciliation.view"
  | "reconciliation.edit"
  | "reports.view"
  | "settings.view"
  | "settings.edit";

const ALL_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "customers.view",
  "customers.edit",
  "products.view",
  "products.edit",
  "lucky-plan.view",
  "lucky-plan.edit",
  "subscriptions.view",
  "subscriptions.edit",
  "payments.view",
  "payments.collect",
  "billing.view",
  "billing.edit",
  "inventory.view",
  "inventory.edit",
  "delivery.view",
  "delivery.edit",
  "rent-lease.view",
  "rent-lease.edit",
  "accounting.view",
  "accounting.edit",
  "reconciliation.view",
  "reconciliation.edit",
  "reports.view",
  "settings.view",
  "settings.edit",
];

const CASHIER_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "customers.view",
  "payments.view",
  "payments.collect",
  "billing.view",
  "subscriptions.view",
];

const STAFF_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "customers.view",
  "products.view",
  "subscriptions.view",
  "payments.view",
  "billing.view",
  "inventory.view",
  "delivery.view",
];

const rolePermissions: Record<AppRole, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  PARTNER: ALL_PERMISSIONS,
  CASHIER: CASHIER_PERMISSIONS,
  STAFF: STAFF_PERMISSIONS,
  VENDOR: ["dashboard.view", "products.view", "inventory.view"],
  CUSTOMER: ["dashboard.view"],
};

export function hasPermission(role: string, permission: Permission): boolean {
  const perms = rolePermissions[role as AppRole];
  return perms ? perms.includes(permission) : false;
}
