import { apiFetch } from "@/lib/api";

export type CollectionControlCenterRole = "admin" | "cashier";

export type CollectionControlSummary = {
  due_today_count: number;
  overdue_count: number;
  pending_emi_count: number;
  pending_emi_amount: string;
  direct_sale_outstanding_count: number;
  direct_sale_outstanding_amount: string;
  rent_lease_due_count: number;
  rent_lease_due_amount: string;
  blocked_finance_account_count: number;
  ready_finance_account_count: number;
  pending_receipt_count?: number | null;
  unreconciled_collection_count?: number | null;
};

export type CollectionControlFinanceAccount = {
  id: number;
  name: string;
  kind: "CASH" | "BANK" | "UPI" | string;
  branch_id?: number | null;
  branch_name?: string | null;
  mapped_chart_account?: {
    id: number;
    code: string;
    name: string;
    account_type: string;
    is_active: boolean;
    allow_manual_posting: boolean;
  } | null;
  collection_ready: boolean;
  collection_blocker_reason?: string | null;
  recommended_action?: string | null;
};

export type CollectionControlLane = {
  key: string;
  label: string;
  enabled: boolean;
  route?: string | null;
  description?: string;
};

export type CollectionControlRecentPayment = {
  id: number;
  payment_date?: string | null;
  amount: string;
  method?: string | null;
  reference_no?: string | null;
  customer_name?: string | null;
  subscription_id?: number | null;
  subscription_number?: string | null;
  emi_id?: number | null;
  emi_month_no?: number | null;
  finance_account_name?: string | null;
};

export type CollectionControlPayload = {
  role: CollectionControlCenterRole;
  read_only: boolean;
  summary: CollectionControlSummary;
  finance_account_readiness: {
    counts: {
      active_count: number;
      ready_count: number;
      blocked_count: number;
      cash_ready_count: number;
      bank_ready_count: number;
      upi_ready_count: number;
    };
    accounts: CollectionControlFinanceAccount[];
  };
  collection_lanes: CollectionControlLane[];
  route_hints: Record<string, string | null | undefined>;
  recent_collections: CollectionControlRecentPayment[];
};

export async function getAdminCollectionControlCenter(): Promise<CollectionControlPayload> {
  return apiFetch<CollectionControlPayload>("/admin/collections/control-center/");
}

export async function getCashierCollectionControlCenter(): Promise<CollectionControlPayload> {
  return apiFetch<CollectionControlPayload>("/cashier/collections/control-center/");
}
