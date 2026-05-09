import { request } from "@/services/api";
import { toPaginated } from "@/services/api/list";
import type { ApiPaginatedResponse } from "@/services/api/types";

export type EmiRecord = {
  id: number;
  subscription: number;
  customer?: number | null;
  customer_name?: string;
  customer_phone?: string;
  subscription_status?: string;
  batch_code?: string;
  lucky_number?: number;
  month_no: number;
  due_date: string;
  amount: string;
  total_paid?: string;
  paid_amount?: string;
  waived_amount?: string;
  balance_amount?: string;
  outstanding_amount?: string;
  status: string;
  is_overdue?: boolean;
  overdue_days?: number;
};

export type EmiQuery = {
  status?: string;
  overdue_only?: boolean;
  subscription?: string | number;
  page?: number;
};

function buildQuery(params: EmiQuery = {}): string {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.overdue_only) search.set("overdue_only", "true");
  if (params.subscription !== undefined && params.subscription !== "") {
    search.set("subscription", String(params.subscription));
  }
  if (params.page) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listEmis(params: EmiQuery = {}): Promise<ApiPaginatedResponse<EmiRecord>> {
  const payload = await request(`/admin/emis/${buildQuery(params)}`);
  return toPaginated<EmiRecord>(payload);
}
