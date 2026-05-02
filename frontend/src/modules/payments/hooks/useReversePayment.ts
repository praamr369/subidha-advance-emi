import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateAfterSubscriptionPaymentMutation } from "@/lib/operational-query-invalidation";
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

      await invalidateAfterSubscriptionPaymentMutation(queryClient);
      await Promise.all([
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
