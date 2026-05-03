import type { QueryClient } from "@tanstack/react-query";

import {
  businessSetupKeys,
  collectionsKeys,
  dashboardKeys,
  directSalesKeys,
  emiKeys,
  financeAccountKeys,
  inventoryKeys,
  notificationKeys,
  paymentsKeys,
  productKeys,
  reconciliationKeys,
  subscriptionKeys,
} from "@/lib/query-keys";

async function invalidateDashboardCollectionsSubscriptions(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: dashboardKeys.summary() }),
    queryClient.invalidateQueries({ queryKey: dashboardKeys.todayQueue() }),
    queryClient.invalidateQueries({ queryKey: dashboardKeys.priorityAlerts() }),
    queryClient.invalidateQueries({ queryKey: collectionsKeys.dueToday() }),
    queryClient.invalidateQueries({ queryKey: collectionsKeys.overdue() }),
    queryClient.invalidateQueries({ queryKey: collectionsKeys.recent() }),
    queryClient.invalidateQueries({ queryKey: subscriptionKeys.root }),
  ]);
}

/**
 * Shared React Query invalidations after money-moving EMI/subscription mutations.
 * Keeps dashboard widgets and collection surfaces coherent without touching posting logic.
 */
export async function invalidateAfterSubscriptionPaymentMutation(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: paymentsKeys.root }),
    queryClient.invalidateQueries({ queryKey: reconciliationKeys.root }),
    queryClient.invalidateQueries({ queryKey: reconciliationKeys.snapshot }),
    queryClient.invalidateQueries({ queryKey: emiKeys.root }),
    queryClient.invalidateQueries({ queryKey: emiKeys.overdue() }),
    queryClient.invalidateQueries({ queryKey: emiKeys.pending() }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    invalidateDashboardCollectionsSubscriptions(queryClient),
  ]);
}

/** After creating a direct sale (invoice draft/post + optional requirements). */
export async function invalidateAfterDirectSaleCreate(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: directSalesKeys.all }),
    queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "requirements"] }),
    queryClient.invalidateQueries({ queryKey: financeAccountKeys.collectionList() }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    queryClient.invalidateQueries({ queryKey: businessSetupKeys.all }),
    invalidateDashboardCollectionsSubscriptions(queryClient),
  ]);
}

/** After collecting payment on an existing direct-sale receivable. */
export async function invalidateAfterDirectSaleCollect(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: directSalesKeys.all }),
    queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "requirements"] }),
    queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "workspace"] }),
    queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "items"] }),
    queryClient.invalidateQueries({ queryKey: paymentsKeys.root }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    invalidateDashboardCollectionsSubscriptions(queryClient),
  ]);
}

/** Stock requirement rows created/updated outside full direct-sale create (if applicable). */
export async function invalidateAfterStockRequirementMutation(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "requirements"] }),
    queryClient.invalidateQueries({ queryKey: directSalesKeys.all }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    invalidateDashboardCollectionsSubscriptions(queryClient),
  ]);
}

/** After notification read state changes from the bell or notification center. */
export async function invalidateAfterNotificationMutation(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
}

/** Business profile, branches, finance accounts setup, etc. */
export async function invalidateAfterBusinessSetupMutation(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: businessSetupKeys.all }),
    queryClient.invalidateQueries({ queryKey: financeAccountKeys.collectionList() }),
    invalidateDashboardCollectionsSubscriptions(queryClient),
  ]);
}

/** Document numbering sequences saved — affects billing readiness + checklist. */
export async function invalidateAfterDocumentNumberingMutation(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: businessSetupKeys.all }),
    queryClient.invalidateQueries({ queryKey: directSalesKeys.all }),
    invalidateDashboardCollectionsSubscriptions(queryClient),
  ]);
}

/** Product master or inventory item operational profile saved. */
export async function invalidateAfterProductInventoryMutation(
  queryClient: QueryClient,
  context?: { productId?: string | number; inventoryItemId?: number },
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [...productKeys.all, "list"] }),
    queryClient.invalidateQueries({ queryKey: productKeys.billingSearchPrefix }),
    queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "items"] }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.workspace() }),
    queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "requirements"] }),
    queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "stock-movements"] }),
    queryClient.invalidateQueries({ queryKey: directSalesKeys.all }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    invalidateDashboardCollectionsSubscriptions(queryClient),
  ]);
  if (context?.productId !== undefined) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: productKeys.detail(context.productId) }),
      queryClient.invalidateQueries({ queryKey: productKeys.edit(context.productId) }),
    ]);
  }
  if (context?.inventoryItemId !== undefined) {
    await queryClient.invalidateQueries({ queryKey: inventoryKeys.item(context.inventoryItemId) });
  }
}

/** After opening stock manual post, CSV apply, or correction draft creation. */
export async function invalidateAfterOpeningStockMutation(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "opening-stock"] }),
    queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "items"] }),
    queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "stock-movements"] }),
    queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "stock-summary"] }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.workspace() }),
    queryClient.invalidateQueries({ queryKey: [...productKeys.all, "list"] }),
    queryClient.invalidateQueries({ queryKey: productKeys.billingSearchPrefix }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    invalidateDashboardCollectionsSubscriptions(queryClient),
  ]);
}

/**
 * @deprecated Use `invalidateAfterDirectSaleCreate` or `invalidateAfterDirectSaleCollect`.
 * Broad invalidation kept for backwards compatibility with existing call sites.
 */
export async function invalidateAfterDirectSaleMutation(queryClient: QueryClient): Promise<void> {
  await invalidateAfterDirectSaleCreate(queryClient);
}
