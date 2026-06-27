import { apiFetch } from "@/lib/api";
import { request } from "@/services/api";

// =====================================================
// P3C — Customer Risk Profile
// =====================================================

export type CustomerRiskBand = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";

export type CustomerRiskProfile = {
  customer_id: number;
  risk_score: number;
  risk_band: CustomerRiskBand;
  reason_codes: string[];
  last_calculated_at: string | null;
  metadata: Record<string, unknown>;
  is_persisted: boolean;
};

export async function fetchCustomerRiskProfile(customerId: number): Promise<CustomerRiskProfile> {
  return apiFetch<CustomerRiskProfile>(`/admin/customers/${customerId}/risk-profile/`);
}

// =====================================================
// P3D — Customer Timeline
// =====================================================

export type CustomerTimelineEventSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL" | string;

export type CustomerTimelineEvent = {
  event_id: string;
  event_type: string;
  event_date: string | null;
  title: string;
  description: string;
  source_model: string;
  source_id: number | string | null;
  status: string;
  severity: CustomerTimelineEventSeverity;
};

export type CustomerTimelineResponse = {
  customer_id?: number;
  count: number;
  results: CustomerTimelineEvent[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTimelineEvent(value: unknown): CustomerTimelineEvent | null {
  if (!isRecord(value)) return null;
  if (
    (typeof value.event_id !== "string" && typeof value.event_id !== "number") ||
    typeof value.event_type !== "string" ||
    typeof value.title !== "string" ||
    typeof value.severity !== "string"
  ) {
    return null;
  }

  const sourceId = value.source_id;
  return {
    event_id: String(value.event_id),
    event_type: value.event_type,
    event_date: typeof value.event_date === "string" ? value.event_date : null,
    title: value.title,
    description: typeof value.description === "string" ? value.description : "",
    source_model: typeof value.source_model === "string" ? value.source_model : "",
    source_id:
      typeof sourceId === "string" || typeof sourceId === "number"
        ? sourceId
        : null,
    status: typeof value.status === "string" ? value.status : "",
    severity: value.severity,
  };
}

function normalizeCustomerTimeline(
  payload: unknown
): CustomerTimelineResponse {
  const source = isRecord(payload) ? payload : {};
  const rawEvents = Array.isArray(source.events)
    ? source.events
    : Array.isArray(source.results)
      ? source.results
      : [];
  const results = rawEvents.flatMap((event) => {
    const normalized = normalizeTimelineEvent(event);
    return normalized ? [normalized] : [];
  });
  const rawCount = Number(source.count);

  return {
    ...(typeof source.customer_id === "number"
      ? { customer_id: source.customer_id }
      : {}),
    count: Number.isFinite(rawCount) && rawCount >= 0 ? rawCount : results.length,
    results,
  };
}

export type CustomerTimelineParams = {
  event_type?: string;
  source_model?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  ordering?: "asc" | "desc";
};

export async function fetchCustomerTimeline(
  customerId: number,
  params: CustomerTimelineParams = {}
): Promise<CustomerTimelineResponse> {
  const qs = new URLSearchParams();
  if (params.event_type) qs.set("event_type", params.event_type);
  if (params.source_model) qs.set("source_model", params.source_model);
  if (params.date_from) qs.set("date_from", params.date_from);
  if (params.date_to) qs.set("date_to", params.date_to);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.ordering) qs.set("ordering", params.ordering);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const payload = await apiFetch<unknown>(
    `/admin/customers/${customerId}/timeline/${suffix}`
  );
  return normalizeCustomerTimeline(payload);
}

// =====================================================
// P3B — Rental Asset Readiness (per subscription)
// =====================================================

export type RentalAssetSummary = {
  id: number;
  asset_code: string | null;
  status: string | null;
  condition_grade: string | null;
};

export type RentalAssetReadiness = {
  subscription_id: number;
  plan_type: string;
  has_before_handover_snapshot: boolean;
  linked_assets: RentalAssetSummary[];
  activation_readiness: {
    can_reach_active_or_handover: boolean;
    blocker_codes: string[];
    missing_documents: string[];
  };
};

export async function fetchSubscriptionRentalAssetReadiness(
  subscriptionId: number
): Promise<RentalAssetReadiness> {
  return apiFetch<RentalAssetReadiness>(
    `/admin/rental-assets/subscription-readiness/${subscriptionId}/`
  );
}

// =====================================================
// Existing — Customer Operational Summary
// =====================================================

export type CustomerRiskStatus =
  | "GOOD"
  | "ACTIVE"
  | "DUE"
  | "OVERDUE"
  | "HISTORY"
  | "CANCELLED"
  | "DELIVERY_PENDING"
  | "SERVICE_OPEN";

export type CustomerOperationalSummaryResponse = {
  customer: {
    id: number;
    name: string;
    phone: string;
    kyc_id?: string | null;
    status: string;
  };
  summary: {
    active_subscriptions: number;
    cancelled_subscription_count?: number;
    historical_subscriptions?: number;
    active_contract_value?: string;
    historical_contract_value?: string;
    subscription_outstanding: string;
    active_subscription_due?: string;
    direct_sale_outstanding: string;
    returned_direct_sale_count?: number;
    rent_lease_outstanding: string;
    overdue_emi_count: number;
    active_overdue_emi_count?: number;
    active_overdue_emi_amount?: string;
    pending_delivery_count: number;
    open_service_count: number;
    last_payment_date: string | null;
    active_payment_count?: number;
    reversed_payment_count?: number;
    active_collected_amount?: string;
    reversed_payment_amount?: string;
    has_history_only_contracts?: boolean;
    history_badges?: string[];
    risk_status: CustomerRiskStatus;
  };
  subscriptions: Record<string, unknown>[];
  direct_sales: Record<string, unknown>[];
  rent_lease_contracts: Record<string, unknown>[];
  deliveries: Record<string, unknown>[];
  service_tickets: Record<string, unknown>[];
  recent_activity: Record<string, unknown>[];
};

const CACHE_TTL_MS = 45_000;
const cache = new Map<number, { expiresAt: number; data: CustomerOperationalSummaryResponse }>();

export async function getCustomerOperationalSummary(
  customerId: number,
  scope: "admin" | "cashier"
): Promise<CustomerOperationalSummaryResponse> {
  const now = Date.now();
  const cached = cache.get(customerId);
  if (cached && cached.expiresAt > now) return cached.data;

  const data = await request<CustomerOperationalSummaryResponse>(
    `/${scope}/customers/${customerId}/operational-summary/`,
    { method: "GET" } as RequestInit
  );
  cache.set(customerId, { expiresAt: now + CACHE_TTL_MS, data });
  return data;
}

export function invalidateCustomerOperationalSummary(customerId: number): void {
  cache.delete(customerId);
}
