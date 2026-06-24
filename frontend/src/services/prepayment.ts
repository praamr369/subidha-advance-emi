import { apiFetch } from "@/lib/api";

export interface PrepaymentCalculation {
  subscription_id: number;
  contract_ref: string;
  customer_name: string;
  plan_type: string;
  total_emis: number;
  paid_emis: number;
  remaining_emis: number;
  monthly_amount: string;
  threshold_percentage: number;
  threshold_emis_needed: number;
  prepayment_required: string;
  status: string;
  already_unlocked: boolean;
}

export interface PrepaymentResult {
  success: boolean;
  subscription_id: number;
  prepayment_amount: string;
  prepayment_date: string;
  advance_delivery_unlocked: boolean;
  delivery_id: number;
  message: string;
}

export interface PrepaymentRecord {
  subscription_id: number;
  contract_ref: string;
  customer_name: string;
  prepayment_amount: string;
  prepayment_date: string;
  delivery_status: string | null;
}

export function calculatePrepayment(subscriptionId: number): Promise<PrepaymentCalculation> {
  return apiFetch(`/admin/subscriptions/${subscriptionId}/prepayment/calculate/`);
}

export function unlockAdvancedDelivery(
  subscriptionId: number,
  payload: { amount: string; request_delivery?: boolean }
): Promise<PrepaymentResult> {
  return apiFetch(`/admin/subscriptions/${subscriptionId}/prepayment/unlock-delivery/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listPrepayments(): Promise<{ count: number; results: PrepaymentRecord[] }> {
  return apiFetch("/admin/prepayments/");
}
