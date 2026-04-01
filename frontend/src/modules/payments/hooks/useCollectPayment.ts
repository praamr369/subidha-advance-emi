import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  collectPayment,
  type PaymentCollectionPayload,
} from "@/services/payments";

export function useCollectPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PaymentCollectionPayload) => collectPayment(payload),
    onSuccess: async (result) => {
      const subscriptionId = result?.subscription?.id;
      const paymentId = result?.payment?.id;
      const emiId = result?.emi?.id;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-today-queue"] }),
        queryClient.invalidateQueries({
          queryKey: ["dashboard-priority-alerts"],
        }),
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

      if (subscriptionId) {
        await queryClient.invalidateQueries({
          queryKey: ["subscription", subscriptionId],
        });
      }

      if (paymentId) {
        await queryClient.invalidateQueries({
          queryKey: ["payment", paymentId],
        });

        await queryClient.invalidateQueries({
          queryKey: ["payment-timeline", paymentId],
        });
      }

      if (emiId) {
        await queryClient.invalidateQueries({
          queryKey: ["emi", emiId],
        });
      }
    },
  });
}
