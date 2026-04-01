import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  reversePayment,
  type PaymentReversePayload,
  type PaymentReverseResponse,
} from "@/services/payments";

type ReversePaymentVariables = {
  paymentId: number | string;
  payload: PaymentReversePayload;
};

export function useReversePayment() {
  const queryClient = useQueryClient();

  return useMutation<PaymentReverseResponse, Error, ReversePaymentVariables>({
    mutationFn: async ({ paymentId, payload }) => {
      return reversePayment(paymentId, payload);
    },

    onSuccess: async (result, variables) => {
      const paymentId = variables.paymentId;
      const subscriptionId = result?.subscription?.id;
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
        queryClient.invalidateQueries({ queryKey: ["payment", paymentId] }),
        queryClient.invalidateQueries({
          queryKey: ["payment-timeline", paymentId],
        }),
      ]);

      if (subscriptionId) {
        await queryClient.invalidateQueries({
          queryKey: ["subscription", subscriptionId],
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
