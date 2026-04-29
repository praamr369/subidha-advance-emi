import { apiFetch } from "@/lib/api";

export type ChartPayload = {
  labels?: string[];
  series?: Array<{ name?: string; data?: Array<string | number> }>;
  totals?: Record<string, unknown>;
  meta?: {
    source?: string;
    date_from?: string | null;
    date_to?: string | null;
    empty_reason?: string | null;
    ignored_filters?: string[];
  };
};

export type BiSummary = {
  as_of: string;
  sources: Array<{ key: string; path: string }>;
  finance: {
    collection_trend: ChartPayload;
    due_vs_collected: ChartPayload;
    overdue_aging: ChartPayload;
    payment_method_split: ChartPayload;
    waiver_loss_exposure: { waived_count: number; waived_amount: string };
    deposit_liability: { held_total: string; deposit_rows: unknown[] };
    revenue_breakdown: {
      advance_emi: unknown;
      rent: unknown;
      lease: unknown;
      direct_sale: unknown;
    };
  };
  subscriptions: {
    product_demand: ChartPayload;
    erp_snapshot: {
      today_work: Array<unknown>;
      sales_pipeline: Array<unknown>;
      operations_pipeline: Array<unknown>;
    };
  };
  inventory: {
    product_demand: ChartPayload;
  };
  operations: {
    queue_summary: { count: number; results: unknown[] };
  };
  hr: {
    active_staff: number;
    today_present: number;
    today_absent: number;
    pending_leave_requests: number;
    pending_expense_claims: number;
    payroll_periods_active: number;
    salary_payments_pending: number;
  };
};

export async function getAdminBiSummary(): Promise<BiSummary> {
  return apiFetch("/admin/bi/summary/");
}
