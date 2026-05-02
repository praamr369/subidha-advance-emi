import type { NavigationRole } from "@/config/navigation";

/** Stable TanStack Query roots for prefix invalidation (`invalidateQueries({ queryKey: x.all })`). */

export const dashboardKeys = {
  summary: () => ["dashboard-summary"] as const,
  todayQueue: () => ["dashboard-today-queue"] as const,
  priorityAlerts: () => ["dashboard-priority-alerts"] as const,
};

export const collectionsKeys = {
  dueToday: () => ["collections-due-today"] as const,
  overdue: () => ["collections-overdue"] as const,
  recent: () => ["collections-recent"] as const,
};

export const reconciliationKeys = {
  root: ["reconciliation"] as const,
  snapshot: ["reconciliation-snapshot"] as const,
};

export const emiKeys = {
  root: ["emis"] as const,
  overdue: () => ["overdue-emis"] as const,
  pending: () => ["pending-emis"] as const,
};

export const subscriptionKeys = {
  root: ["subscriptions"] as const,
};

export const paymentsKeys = {
  root: ["payments"] as const,
};

export const directSalesKeys = {
  all: ["direct-sales"] as const,
  /** Admin billing workspace register list */
  adminRegister: () => [...directSalesKeys.all, "admin-register"] as const,
};

export type InventoryRequirementFilterKey = {
  status: string;
  source_module: string;
};

export const inventoryRequirementKeys = {
  all: ["inventory-requirements"] as const,
  adminList: (filters: InventoryRequirementFilterKey) =>
    [...inventoryRequirementKeys.all, "admin", filters] as const,
};

export const financeAccountKeys = {
  /** Accounts scoped for payment/direct-sale collection pickers */
  collectionList: () => ["finance-accounts", "collection"] as const,
};

export const notificationKeys = {
  all: ["notifications"] as const,
  bell: (role: NavigationRole) => [...notificationKeys.all, "bell", role] as const,
};

export const businessSetupKeys = {
  all: ["business-setup"] as const,
  checklist: () => [...businessSetupKeys.all, "checklist"] as const,
  documentNumbering: () => [...businessSetupKeys.all, "document-numbering"] as const,
  resetPreview: (username: string) => [...businessSetupKeys.all, "reset-preview", username] as const,
};

const productsRoot = ["products"] as const;

export const productKeys = {
  all: productsRoot,
  detail: (productId: string | number) => [...productsRoot, "detail", String(productId)] as const,
  /** Prefix for billing workspace product search (if wired to React Query later). */
  billingSearchPrefix: [...productsRoot, "billing-search"] as const,
};

export const inventoryKeys = {
  all: ["inventory"] as const,
  item: (id: number) => [...inventoryKeys.all, "item", id] as const,
  workspace: () => [...inventoryKeys.all, "workspace"] as const,
};

export const customerKeys = {
  all: ["customers"] as const,
  /** Customer directory list hook */
  list: () => ["customers"] as const,
};

export const cashierKeys = {
  all: ["cashier"] as const,
};

export const partnerKeys = {
  all: ["partner"] as const,
};
