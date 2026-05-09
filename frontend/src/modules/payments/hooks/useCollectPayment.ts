import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateAfterSubscriptionPaymentMutation } from "@/lib/operational-query-invalidation";
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

      await invalidateAfterSubscriptionPaymentMutation(queryClient);

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
