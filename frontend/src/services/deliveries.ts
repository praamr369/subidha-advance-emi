import { apiFetch } from "@/lib/api";

export type DeliveryStatus =
  | "PENDING"
  | "SCHEDULED"
  | "DISPATCHED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURNED";

export type DeliveryBucket = "" | "PENDING" | "DELIVERED";

export type DeliveryRecord = {
  id: number;
  subscription?: number | null;
  subscription_id?: number | null;
  subscription_number?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  product_id?: number | null;
  product_name?: string | null;
  product_code?: string | null;
  batch_id?: number | null;
  batch_code?: string | null;
  partner_id?: number | null;
  partner_username?: string | null;
  lucky_id?: number | null;
  lucky_number?: number | null;
  status: DeliveryStatus;
  delivery_reference: string;
  scheduled_date?: string | null;
  dispatched_at?: string | null;
  out_for_delivery_at?: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
  cancelled_at?: string | null;
  return_requested_at?: string | null;
  returned_at?: string | null;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  delivery_address_snapshot?: string | null;
  notes?: string | null;
  failure_reason?: string | null;
  created_by_id?: number | null;
  created_by_username?: string | null;
  updated_by_id?: number | null;
  updated_by_username?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  fulfillment_status?: string | null;
  is_terminal?: boolean;
  is_active_delivery?: boolean;
  history_count?: number;
};

export type DeliveryReportSummary = {
  total: number;
  pending: number;
  scheduled: number;
  in_transit: number;
  dispatched: number;
  out_for_delivery: number;
  delivered: number;
  failed: number;
  cancelled: number;
  return_requested: number;
  returned: number;
};

export type DeliveryListResponse = {
  count: number;
  summary: DeliveryReportSummary;
  results: DeliveryRecord[];
};

export type AdminDeliveryQuery = {
  q?: string;
  status?: DeliveryStatus | "";
  customer?: number | string;
  subscription?: number | string;
  batch?: number | string;
  bucket?: DeliveryBucket;
  date_from?: string;
  date_to?: string;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  return null;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

function normalizeStatus(value: unknown): DeliveryStatus {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === "PENDING" ||
    normalized === "SCHEDULED" ||
    normalized === "DISPATCHED" ||
    normalized === "OUT_FOR_DELIVERY" ||
    normalized === "DELIVERED" ||
    normalized === "FAILED" ||
    normalized === "CANCELLED" ||
    normalized === "RETURN_REQUESTED" ||
    normalized === "RETURNED"
  ) {
    return normalized;
  }
  return "PENDING";
}

export function normalizeDeliveryRecord(payload: unknown): DeliveryRecord {
  const row = (payload ?? {}) as Record<string, unknown>;

  return {
    id: toNumber(row.id),
    subscription: toNullableNumber(row.subscription),
    subscription_id:
      toNullableNumber(row.subscription_id) ?? toNullableNumber(row.subscription),
    subscription_number: toStringOrNull(row.subscription_number),
    customer_id: toNullableNumber(row.customer_id),
    customer_name: toStringOrNull(row.customer_name),
    customer_phone: toStringOrNull(row.customer_phone),
    product_id: toNullableNumber(row.product_id),
    product_name: toStringOrNull(row.product_name),
    product_code: toStringOrNull(row.product_code),
    batch_id: toNullableNumber(row.batch_id),
    batch_code: toStringOrNull(row.batch_code),
    partner_id: toNullableNumber(row.partner_id),
    partner_username: toStringOrNull(row.partner_username),
    lucky_id: toNullableNumber(row.lucky_id),
    lucky_number: toNullableNumber(row.lucky_number),
    status: normalizeStatus(row.status),
    delivery_reference: String(row.delivery_reference ?? ""),
    scheduled_date: toStringOrNull(row.scheduled_date),
    dispatched_at: toStringOrNull(row.dispatched_at),
    out_for_delivery_at: toStringOrNull(row.out_for_delivery_at),
    delivered_at: toStringOrNull(row.delivered_at),
    failed_at: toStringOrNull(row.failed_at),
    cancelled_at: toStringOrNull(row.cancelled_at),
    return_requested_at: toStringOrNull(row.return_requested_at),
    returned_at: toStringOrNull(row.returned_at),
    receiver_name: toStringOrNull(row.receiver_name),
    receiver_phone: toStringOrNull(row.receiver_phone),
    delivery_address_snapshot: toStringOrNull(row.delivery_address_snapshot),
    notes: toStringOrNull(row.notes),
    failure_reason: toStringOrNull(row.failure_reason),
    created_by_id: toNullableNumber(row.created_by_id),
    created_by_username: toStringOrNull(row.created_by_username),
    updated_by_id: toNullableNumber(row.updated_by_id),
    updated_by_username: toStringOrNull(row.updated_by_username),
    created_at: toStringOrNull(row.created_at),
    updated_at: toStringOrNull(row.updated_at),
    fulfillment_status: toStringOrNull(row.fulfillment_status),
    is_terminal: toBoolean(row.is_terminal),
    is_active_delivery: toBoolean(row.is_active_delivery),
    history_count: toNumber(row.history_count, 0) || undefined,
  };
}

export function normalizeDeliverySummary(payload: unknown): DeliveryReportSummary {
  const row = (payload ?? {}) as Record<string, unknown>;
  return {
    total: toNumber(row.total, 0),
    pending: toNumber(row.pending, 0),
    scheduled: toNumber(row.scheduled, 0),
    in_transit: toNumber(row.in_transit, 0),
    dispatched: toNumber(row.dispatched, 0),
    out_for_delivery: toNumber(row.out_for_delivery, 0),
    delivered: toNumber(row.delivered, 0),
    failed: toNumber(row.failed, 0),
    cancelled: toNumber(row.cancelled, 0),
    return_requested: toNumber(row.return_requested, 0),
    returned: toNumber(row.returned, 0),
  };
}

export function normalizeDeliveryListResponse(payload: unknown): DeliveryListResponse {
  const root = (payload ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results) ? root.results : [];

  return {
    count: toNumber(root.count, 0),
    summary: normalizeDeliverySummary(root.summary),
    results: results.map(normalizeDeliveryRecord),
  };
}

function buildQuery(params: AdminDeliveryQuery = {}): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.customer !== undefined && params.customer !== "") search.set("customer", String(params.customer));
  if (params.subscription !== undefined && params.subscription !== "") search.set("subscription", String(params.subscription));
  if (params.batch !== undefined && params.batch !== "") search.set("batch", String(params.batch));
  if (params.bucket) search.set("bucket", params.bucket);
  if (params.date_from) search.set("date_from", params.date_from);
  if (params.date_to) search.set("date_to", params.date_to);

  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listAdminDeliveries(params: AdminDeliveryQuery = {}): Promise<DeliveryListResponse> {
  const payload = await apiFetch<unknown>(`/admin/deliveries/${buildQuery(params)}`);
  return normalizeDeliveryListResponse(payload);
}

export async function getAdminDeliverySummary(params: AdminDeliveryQuery = {}): Promise<DeliveryReportSummary> {
  const payload = await apiFetch<unknown>(`/admin/deliveries/summary/${buildQuery(params)}`);
  return normalizeDeliverySummary(payload);
}

export async function getAdminDelivery(id: number | string): Promise<DeliveryRecord> {
  const payload = await apiFetch<unknown>(`/admin/deliveries/${id}/`);
  return normalizeDeliveryRecord(payload);
}

export async function createAdminDelivery(payload: {
  subscription: number;
  status?: "PENDING" | "SCHEDULED";
  delivery_reference?: string;
  scheduled_date?: string | null;
  receiver_name?: string;
  receiver_phone?: string;
  delivery_address_snapshot?: string;
  notes?: string;
}): Promise<DeliveryRecord> {
  const response = await apiFetch<unknown>("/admin/deliveries/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeDeliveryRecord(response);
}

export async function updateAdminDelivery(
  id: number | string,
  payload: {
    scheduled_date?: string | null;
    receiver_name?: string;
    receiver_phone?: string;
    delivery_address_snapshot?: string;
    notes?: string;
    failure_reason?: string;
  }
): Promise<DeliveryRecord> {
  const response = await apiFetch<unknown>(`/admin/deliveries/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return normalizeDeliveryRecord(response);
}

export async function transitionAdminDelivery(
  id: number | string,
  payload: {
    status: DeliveryStatus;
    scheduled_date?: string | null;
    receiver_name?: string;
    receiver_phone?: string;
    notes?: string;
    failure_reason?: string;
  }
): Promise<DeliveryRecord> {
  const response = await apiFetch<unknown>(`/admin/deliveries/${id}/transition/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeDeliveryRecord(response);
}

export async function markAdminDeliveryDelivered(
  id: number | string,
  payload: {
    receiver_name?: string;
    receiver_phone?: string;
    notes?: string;
  }
): Promise<DeliveryRecord> {
  const response = await apiFetch<unknown>(`/admin/deliveries/${id}/mark-delivered/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeDeliveryRecord(response);
}

export async function markAdminDeliveryFailed(
  id: number | string,
  payload: {
    reason: string;
    notes?: string;
  }
): Promise<DeliveryRecord> {
  const response = await apiFetch<unknown>(`/admin/deliveries/${id}/mark-failed/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeDeliveryRecord(response);
}

export async function cancelAdminDelivery(
  id: number | string,
  payload: {
    reason: string;
    notes?: string;
  }
): Promise<DeliveryRecord> {
  const response = await apiFetch<unknown>(`/admin/deliveries/${id}/cancel/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeDeliveryRecord(response);
}

export async function requestAdminDeliveryReturn(
  id: number | string,
  payload: { notes?: string } = {}
): Promise<DeliveryRecord> {
  const response = await apiFetch<unknown>(`/admin/deliveries/${id}/request-return/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeDeliveryRecord(response);
}

export async function markAdminDeliveryReturned(
  id: number | string,
  payload: { notes?: string } = {}
): Promise<DeliveryRecord> {
  const response = await apiFetch<unknown>(`/admin/deliveries/${id}/mark-returned/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeDeliveryRecord(response);
}

export async function listCustomerDeliveries(params: {
  status?: DeliveryStatus | "";
  subscription?: number | string;
} = {}): Promise<DeliveryListResponse> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.subscription !== undefined && params.subscription !== "") {
    search.set("subscription", String(params.subscription));
  }
  const query = search.toString();
  const payload = await apiFetch<unknown>(`/customer/deliveries/${query ? `?${query}` : ""}`);
  return normalizeDeliveryListResponse(payload);
}

export async function getCustomerDelivery(id: number | string): Promise<DeliveryRecord> {
  const payload = await apiFetch<unknown>(`/customer/deliveries/${id}/`);
  return normalizeDeliveryRecord(payload);
}
