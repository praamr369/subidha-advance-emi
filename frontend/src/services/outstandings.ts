import { apiFetch } from "@/lib/api";

export type OutstandingOperation =
  | "advance_emi"
  | "rent"
  | "lease"
  | "direct_sale"
  | "billing_invoice";

export type OutstandingState =
  | "all"
  | "overdue"
  | "due_today"
  | "upcoming"
  | "not_due";

export type OutstandingAgeBucket =
  | "all"
  | "current"
  | "1_7"
  | "8_15"
  | "16_30"
  | "31_60"
  | "60_plus";

export type OutstandingRow = {
  id: string;
  operation_type: OutstandingOperation;
  source_type: string;
  source_id: number;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string;
  contract_reference: string;
  document_no: string;
  product_summary: string;
  batch_code: string | null;
  lucky_number: string | null;
  due_date: string | null;
  original_amount: string;
  paid_amount: string;
  waived_amount: string;
  outstanding_amount: string;
  overdue_days: number;
  age_bucket: OutstandingAgeBucket;
  status: string;
  collection_allowed: boolean;
  detail_url: string;
  customer_url: string;
  payment_url: string;
  risk_flags: string[];
};

export type OutstandingSummary = {
  total_outstanding_amount: string;
  overdue_amount: string;
  due_today_amount: string;
  upcoming_amount: string;
  advance_emi_outstanding: string;
  rent_outstanding: string;
  lease_outstanding: string;
  direct_sale_outstanding: string;
  billing_invoice_outstanding: string;
  overdue_count: number;
  serious_30_plus_count: number;
};

export type OutstandingListResponse = {
  count: number;
  page: number;
  page_size: number;
  results: OutstandingRow[];
  summary: OutstandingSummary;
};

export type OutstandingFilters = {
  state?: OutstandingState;
  operation?: "all" | OutstandingOperation;
  q?: string;
  customer?: string;
  from_date?: string;
  to_date?: string;
  age_bucket?: OutstandingAgeBucket;
  min_amount?: string;
  max_amount?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

function buildQuery(params: OutstandingFilters = {}): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listOutstandings(
  params: OutstandingFilters = {}
): Promise<OutstandingListResponse> {
  return apiFetch(`/admin/outstandings/${buildQuery(params)}`);
}

export function outstandingsExportUrl(params: OutstandingFilters = {}): string {
  return `/api/v1/admin/outstandings/export.csv${buildQuery(params)}`;
}
