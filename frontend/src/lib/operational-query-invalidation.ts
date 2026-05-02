import type { QueryClient } from "@tanstack/react-query";

/**
 * Shared React Query invalidations after money-moving EMI/subscription mutations.
 * Keeps dashboard widgets and collection surfaces coherent without touching posting logic.
 */
export async function invalidateAfterSubscriptionPaymentMutation(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["payments"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard-today-queue"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard-priority-alerts"] }),
    queryClient.invalidateQueries({ queryKey: ["reconciliation"] }),
    queryClient.invalidateQueries({ queryKey: ["reconciliation-snapshot"] }),
    queryClient.invalidateQueries({ queryKey: ["collections-due-today"] }),
    queryClient.invalidateQueries({ queryKey: ["collections-overdue"] }),
    queryClient.invalidateQueries({ queryKey: ["collections-recent"] }),
    queryClient.invalidateQueries({ queryKey: ["emis"] }),
    queryClient.invalidateQueries({ queryKey: ["overdue-emis"] }),
    queryClient.invalidateQueries({ queryKey: ["pending-emis"] }),
    queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
  ]);
}

/**
 * Invalidate dashboard/collection caches after direct-sale writes (create, collect, approve).
 * EMI/payment hooks are unchanged; this only refreshes read models that commonly include retail context.
 */
export async function invalidateAfterDirectSaleMutation(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard-today-queue"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard-priority-alerts"] }),
    queryClient.invalidateQueries({ queryKey: ["collections-due-today"] }),
    queryClient.invalidateQueries({ queryKey: ["collections-overdue"] }),
    queryClient.invalidateQueries({ queryKey: ["collections-recent"] }),
    queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
  ]);
}
