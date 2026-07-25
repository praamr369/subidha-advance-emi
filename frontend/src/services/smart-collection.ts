import { apiFetch } from "@/lib/api";

export interface SmartCollectionPlan {
  customer: {
    id: number;
    name: string;
    phone: string;
  };
  input: {
    amount: string;
    use_existing_advance: boolean;
  };
  opening: {
    advance_balance: string;
    emi_outstanding_total: string;
    direct_sale_outstanding_total: string;
  };
  allocations: {
    step: "ADVANCE_TO_EMI" | "CASH_TO_EMI" | "CASH_TO_DIRECT_SALE" | "CASH_TO_ADVANCE";
    amount: string;
    emi_id?: number;
    subscription_number?: string;
    month_no?: number;
    direct_sale_id?: number;
    sale_no?: string;
  }[];
  skipped: {
    reason: string;
    emi_id: number;
    emi_amount: string;
    available: string;
  }[];
  closing: {
    advance_balance: string;
    cash_unallocated: string;
  };
  dry_run: boolean;
  idempotent_replay: boolean;
  receipt?: {
    receipt_no: string;
    receipt_date: string;
    payment_ids: number[];
    receipt_ids: number[];
    advance_id?: number;
  };
}

export async function fetchSmartCollectionOutstanding(customerId: number): Promise<SmartCollectionPlan> {
  return await apiFetch<SmartCollectionPlan>(`/api/v1/admin/billing/smart-collect/outstanding/?customer_id=${customerId}`);
}

export async function planSmartCollection(payload: {
  customer_id: number;
  amount: string;
  use_existing_advance: boolean;
}): Promise<SmartCollectionPlan> {
  return await apiFetch<SmartCollectionPlan>("/api/v1/admin/billing/smart-collect/", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      dry_run: true,
    }),
  });
}

export async function executeSmartCollection(payload: {
  customer_id: number;
  amount: string;
  use_existing_advance: boolean;
  payment_method: string;
  finance_account_id: number;
  idempotency_key: string;
  branch_id?: number;
  cash_counter_id?: number;
  reference_no?: string;
  notes?: string;
}): Promise<SmartCollectionPlan> {
  return await apiFetch<SmartCollectionPlan>("/api/v1/admin/billing/smart-collect/", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      dry_run: false,
    }),
  });
}
