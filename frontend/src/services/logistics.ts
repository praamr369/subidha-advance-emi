import { apiFetch } from "@/lib/api";

export type LogisticsCockpit = {
  generated_at: string;
  deliveries_today: Array<{
    id: number;
    type: "SUBSCRIPTION" | "DIRECT_SALE";
    customer_name: string;
    customer_phone?: string;
    address?: string;
    product_name?: string;
    subscription_number?: string;
    case_no?: string;
    status: string;
    scheduled_date?: string | null;
    is_overdue?: boolean;
  }>;
  deliveries_today_count: number;
  stock_alerts: Array<{
    item_id: number;
    product_id: number;
    product_name: string;
    sku?: string;
    on_hand_qty: string;
    available_qty: string;
    reorder_level_qty: string;
    is_below_reorder: boolean;
    default_stock_location_name?: string | null;
  }>;
  stock_alerts_count: number;
  returns_in_flight: Array<{
    id: number;
    case_no: string;
    case_type: string;
    customer_name: string;
    status: string;
    stock_status: string;
    finance_status: string;
  }>;
  returns_in_flight_count: number;
};

export function fetchLogisticsCockpit(): Promise<LogisticsCockpit> {
  return apiFetch<LogisticsCockpit>("/admin/logistics/cockpit/");
}

export type TransportFareSourceType =
  | "DIRECT_SALE"
  | "EMI_CONTRACT"
  | "RENT_CONTRACT"
  | "LEASE_CONTRACT"
  | "SUBSCRIPTION_DELIVERY"
  | "DIRECT_SALE_DELIVERY"
  | "MANUAL";

export type TransportFareSettlementStatus =
  | "PENDING"
  | "PAID_TO_TRANSPORT"
  | "CUSTOMER_PAID_DIRECT"
  | "WAIVED";

export type TransportFareEntry = {
  id: number;
  source_type: TransportFareSourceType;
  reference_no: string;
  customer_name: string;
  entry_date: string | null;
  branch?: number | null;
  branch_name?: string;
  direct_sale?: number | null;
  subscription?: number | null;
  subscription_delivery?: number | null;
  service_case?: number | null;
  van_number: string;
  transport_boy_name: string;
  transport_boy_phone: string;
  van_fare: string;
  settlement_status: TransportFareSettlementStatus;
  paid_to_transport_at?: string | null;
  notes: string;
  accounting_posted: boolean;
  ledger_scope: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TransportFinanceSummary = {
  count: number;
  total_fare: string;
  pending_fare: string;
  paid_to_transport_fare: string;
  customer_paid_direct_fare: string;
  accounting_posted: boolean;
  ledger_scope: string;
};

export type TransportFareListResponse = {
  summary: TransportFinanceSummary;
  results: TransportFareEntry[];
};

export function listTransportFares(params?: {
  source_type?: string;
  settlement_status?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
}): Promise<TransportFareListResponse> {
  const qs = new URLSearchParams();
  if (params?.source_type) qs.set("source_type", params.source_type);
  if (params?.settlement_status) qs.set("settlement_status", params.settlement_status);
  if (params?.date_from) qs.set("date_from", params.date_from);
  if (params?.date_to) qs.set("date_to", params.date_to);
  if (params?.q) qs.set("q", params.q);
  const query = qs.toString();
  return apiFetch<TransportFareListResponse>(`/admin/logistics/transport-fares/${query ? `?${query}` : ""}`);
}

export function createTransportFare(payload: {
  source_type?: TransportFareSourceType;
  reference_no?: string;
  customer_name?: string;
  entry_date?: string;
  van_number?: string;
  transport_boy_name?: string;
  transport_boy_phone?: string;
  van_fare: string;
  settlement_status?: TransportFareSettlementStatus;
  notes?: string;
}): Promise<TransportFareEntry> {
  return apiFetch<TransportFareEntry>("/admin/logistics/transport-fares/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTransportFare(
  id: number,
  payload: Partial<{
    van_number: string;
    transport_boy_name: string;
    transport_boy_phone: string;
    van_fare: string;
    settlement_status: TransportFareSettlementStatus;
    notes: string;
    reference_no: string;
    customer_name: string;
    entry_date: string;
  }>
): Promise<TransportFareEntry> {
  return apiFetch<TransportFareEntry>(`/admin/logistics/transport-fares/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
