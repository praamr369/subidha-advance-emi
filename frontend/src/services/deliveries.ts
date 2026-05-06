import { apiFetch } from "@/lib/api";

export type DeliveryStatus =
  | "PENDING"
  | "SCHEDULED"
  // Phase 2: blocked when stock is unavailable at time of scheduling
  | "BLOCKED_STOCK_UNAVAILABLE"
  | "DISPATCHED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURNED";

export type DeliveryBucket = "" | "PENDING" | "DELIVERED" | "READY_DISPATCH";

export type DeliveryRecord = {
  id: number;
  record_kind?: "SUBSCRIPTION_DELIVERY" | "DIRECT_SALE_CASE" | "DIRECT_SALE_DELIVERY";
  source_type?: "SUBSCRIPTION" | "DIRECT_SALE";
  source_label?: string | null;
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
  // Phase 2: reason populated when status = BLOCKED_STOCK_UNAVAILABLE
  stock_blocked_reason?: string | null;
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
  inventory_stock_status?: "available" | "not available" | "reserved" | "purchase needed" | string;
  inventory_available_qty?: string | null;
  direct_sale_id?: number | null;
  sale_no?: string | null;
  invoice_document_no?: string | null;
  billing_invoice_id?: number | null;
  service_case_id?: number | null;
  case_no?: string | null;
  service_desk_status?: string | null;
  delivery_phase_label?: string | null;
  delivery_phase_code?: string | null;
  delivery_display?: string | null;
  delivery_status?: string | null;
  invoice_state?: string | null;
  payment_state?: string | null;
  stock_state?: string | null;
  delivery_state?: string | null;
  status_label?: string | null;
  case_id?: number | null;
  action_endpoints?: {
    schedule?: string | null;
    dispatch?: string | null;
    mark_delivered?: string | null;
    cancel?: string | null;
    note?: string | null;
  } | null;
  links?: {
    open_invoice?: string | null;
    open_direct_sale?: string | null;
    open_service_case?: string | null;
  } | null;
  detail_hint?: string | null;
  grand_total?: string | null;
  balance_total?: string | null;
  received_total?: string | null;
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
  direct_sale_delivery_cases?: number;
};

export type DeliveryListResponse = {
  count: number;
  subscription_delivery_count?: number;
  direct_sale_delivery_count?: number;
  summary: DeliveryReportSummary;
  results: DeliveryRecord[];
};

export type SubscriptionPlanType = "EMI" | "RENT" | "LEASE";

export type DeliverySourceSubscription = {
  id: number;
  subscription_number?: string | null;
  plan_type: SubscriptionPlanType;
  contract_reference?: string | null;
  fulfillment_status?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  product_id?: number | null;
  product_name?: string | null;
  product_code?: string | null;
  batch_id?: number | null;
  batch_code?: string | null;
  lucky_id?: number | null;
  lucky_number?: number | null;
  delivery_summary?: (DeliveryRecord & { delivery_status?: DeliveryStatus; history_count?: number }) | null;
  created_at?: string | null;
};

export type DeliverySourceSubscriptionsResponse = {
  count: number;
  results: DeliverySourceSubscription[];
};

export type DeliverySourceSubscriptionPrefill = {
  source: DeliverySourceSubscription;
  defaults: {
    receiver_name?: string;
    receiver_phone?: string;
    delivery_address_snapshot?: string;
    notes?: string;
  };
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
  include_direct_sale_cases?: boolean;
  source_type?: "ALL" | "SUBSCRIPTION" | "DIRECT_SALE";
  sale?: string;
  invoice?: string;
};

export type DeliverySourceDirectSale = {
  id: number;
  sale_no?: string | null;
  status?: string | null;
  delivery_required?: boolean;
  customer_id?: number | null;
  customer_name_snapshot?: string | null;
  customer_phone_snapshot?: string | null;
  grand_total?: string | null;
  received_total?: string | null;
  balance_total?: string | null;
  delivered_at?: string | null;
  billing_invoice_id?: number | null;
  invoice_document_no?: string | null;
  invoice_status?: string | null;
  delivery_preview?: {
    phase_code?: string | null;
    phase_label?: string | null;
    payment_state?: string | null;
    invoice_state?: string | null;
    stock_blocked?: boolean;
  };
  created_at?: string | null;
};

export type DeliverySourceDirectSalesResponse = {
  count: number;
  results: DeliverySourceDirectSale[];
};

export type DeliverySourceDirectSalePrefill = {
  source: DeliverySourceDirectSale;
  defaults: {
    receiver_name?: string;
    receiver_phone?: string;
    delivery_address_snapshot?: string;
    notes?: string;
  };
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
    normalized === "BLOCKED_STOCK_UNAVAILABLE" ||
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
    record_kind:
      row.record_kind === "DIRECT_SALE_CASE" || row.record_kind === "DIRECT_SALE_DELIVERY" || row.record_kind === "SUBSCRIPTION_DELIVERY"
        ? row.record_kind
        : undefined,
    source_type:
      row.source_type === "SUBSCRIPTION" || row.source_type === "DIRECT_SALE" ? row.source_type : undefined,
    source_label: toStringOrNull(row.source_label),
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
    inventory_stock_status: toStringOrNull(row.inventory_stock_status) || undefined,
    inventory_available_qty: toStringOrNull(row.inventory_available_qty),
    stock_blocked_reason: toStringOrNull(row.stock_blocked_reason),
    direct_sale_id: toNullableNumber(row.direct_sale_id),
    sale_no: toStringOrNull(row.sale_no),
    invoice_document_no: toStringOrNull(row.invoice_document_no),
    billing_invoice_id: toNullableNumber(row.billing_invoice_id),
    service_case_id: toNullableNumber(row.service_case_id),
    case_no: toStringOrNull(row.case_no),
    service_desk_status: toStringOrNull(row.service_desk_status),
    delivery_phase_label: toStringOrNull(row.delivery_phase_label),
    delivery_phase_code: toStringOrNull(row.delivery_phase_code),
    delivery_display:
      toStringOrNull(row.delivery_display) ??
      toStringOrNull(row.delivery_phase_label),
    delivery_status: toStringOrNull(row.delivery_status) ?? toStringOrNull(row.delivery_phase_code),
    invoice_state: toStringOrNull(row.invoice_state),
    payment_state: toStringOrNull(row.payment_state),
    stock_state: toStringOrNull(row.stock_state),
    delivery_state: toStringOrNull(row.delivery_state),
    status_label: toStringOrNull(row.status_label),
    case_id: toNullableNumber(row.case_id),
    action_endpoints:
      row.action_endpoints && typeof row.action_endpoints === "object"
        ? ({
            schedule: toStringOrNull((row.action_endpoints as Record<string, unknown>).schedule),
            dispatch: toStringOrNull((row.action_endpoints as Record<string, unknown>).dispatch),
            mark_delivered: toStringOrNull((row.action_endpoints as Record<string, unknown>).mark_delivered),
            cancel: toStringOrNull((row.action_endpoints as Record<string, unknown>).cancel),
            note: toStringOrNull((row.action_endpoints as Record<string, unknown>).note),
          } as DeliveryRecord["action_endpoints"])
        : null,
    links:
      row.links && typeof row.links === "object"
        ? ({
            open_invoice: toStringOrNull((row.links as Record<string, unknown>).open_invoice),
            open_direct_sale: toStringOrNull((row.links as Record<string, unknown>).open_direct_sale),
            open_service_case: toStringOrNull((row.links as Record<string, unknown>).open_service_case),
          } as DeliveryRecord["links"])
        : null,
    detail_hint: toStringOrNull(row.detail_hint),
    grand_total: toStringOrNull(row.grand_total),
    balance_total: toStringOrNull(row.balance_total),
    received_total: toStringOrNull(row.received_total),
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
    direct_sale_delivery_cases: toNumber(row.direct_sale_delivery_cases, 0) || undefined,
  };
}

export function normalizeDeliveryListResponse(payload: unknown): DeliveryListResponse {
  const root = (payload ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results) ? root.results : [];

  return {
    count: toNumber(root.count, 0),
    subscription_delivery_count: toNumber(root.subscription_delivery_count, 0) || undefined,
    direct_sale_delivery_count: toNumber(root.direct_sale_delivery_count, 0) || undefined,
    summary: normalizeDeliverySummary(root.summary),
    results: results.map(normalizeDeliveryRecord),
  };
}

function normalizePlanType(value: unknown): SubscriptionPlanType {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "EMI" || normalized === "RENT" || normalized === "LEASE") return normalized;
  return "EMI";
}

export function normalizeDeliverySourceSubscription(payload: unknown): DeliverySourceSubscription {
  const row = (payload ?? {}) as Record<string, unknown>;
  const deliverySummaryRaw = row.delivery_summary ?? null;
  const deliverySummary =
    deliverySummaryRaw && typeof deliverySummaryRaw === "object"
      ? ({
          ...normalizeDeliveryRecord(deliverySummaryRaw),
          delivery_status: normalizeStatus((deliverySummaryRaw as Record<string, unknown>).delivery_status),
          history_count: toNumber((deliverySummaryRaw as Record<string, unknown>).history_count, 0) || undefined,
        } as DeliverySourceSubscription["delivery_summary"])
      : null;

  return {
    id: toNumber(row.id),
    subscription_number: toStringOrNull(row.subscription_number),
    plan_type: normalizePlanType(row.plan_type),
    contract_reference: toStringOrNull(row.contract_reference),
    fulfillment_status: toStringOrNull(row.fulfillment_status),
    customer_id: toNullableNumber(row.customer_id),
    customer_name: toStringOrNull(row.customer_name),
    customer_phone: toStringOrNull(row.customer_phone),
    product_id: toNullableNumber(row.product_id),
    product_name: toStringOrNull(row.product_name),
    product_code: toStringOrNull(row.product_code),
    batch_id: toNullableNumber(row.batch_id),
    batch_code: toStringOrNull(row.batch_code),
    lucky_id: toNullableNumber(row.lucky_id),
    lucky_number: toNullableNumber(row.lucky_number),
    delivery_summary: deliverySummary,
    created_at: toStringOrNull(row.created_at),
  };
}

export function normalizeDeliverySourceSubscriptionsResponse(payload: unknown): DeliverySourceSubscriptionsResponse {
  const root = (payload ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results) ? root.results : [];
  return {
    count: toNumber(root.count, 0),
    results: results.map(normalizeDeliverySourceSubscription),
  };
}

export function normalizeDeliverySourceSubscriptionPrefill(payload: unknown): DeliverySourceSubscriptionPrefill {
  const root = (payload ?? {}) as Record<string, unknown>;
  const defaults = (root.defaults ?? {}) as Record<string, unknown>;
  return {
    source: normalizeDeliverySourceSubscription(root.source),
    defaults: {
      receiver_name: toStringOrNull(defaults.receiver_name) ?? "",
      receiver_phone: toStringOrNull(defaults.receiver_phone) ?? "",
      delivery_address_snapshot: toStringOrNull(defaults.delivery_address_snapshot) ?? "",
      notes: toStringOrNull(defaults.notes) ?? "",
    },
  };
}

export function normalizeDeliverySourceDirectSale(payload: unknown): DeliverySourceDirectSale {
  const row = (payload ?? {}) as Record<string, unknown>;
  const previewRaw = row.delivery_preview;
  const preview =
    previewRaw && typeof previewRaw === "object"
      ? {
          phase_code: toStringOrNull((previewRaw as Record<string, unknown>).phase_code),
          phase_label: toStringOrNull((previewRaw as Record<string, unknown>).phase_label),
          payment_state: toStringOrNull((previewRaw as Record<string, unknown>).payment_state),
          invoice_state: toStringOrNull((previewRaw as Record<string, unknown>).invoice_state),
          stock_blocked:
            typeof (previewRaw as Record<string, unknown>).stock_blocked === "boolean"
              ? Boolean((previewRaw as Record<string, unknown>).stock_blocked)
              : undefined,
        }
      : undefined;

  return {
    id: toNumber(row.id),
    sale_no: toStringOrNull(row.sale_no),
    status: toStringOrNull(row.status),
    delivery_required: typeof row.delivery_required === "boolean" ? row.delivery_required : undefined,
    customer_id: toNullableNumber(row.customer_id),
    customer_name_snapshot: toStringOrNull(row.customer_name_snapshot),
    customer_phone_snapshot: toStringOrNull(row.customer_phone_snapshot),
    grand_total: toStringOrNull(row.grand_total),
    received_total: toStringOrNull(row.received_total),
    balance_total: toStringOrNull(row.balance_total),
    delivered_at: toStringOrNull(row.delivered_at),
    billing_invoice_id: toNullableNumber(row.billing_invoice_id),
    invoice_document_no: toStringOrNull(row.invoice_document_no),
    invoice_status: toStringOrNull(row.invoice_status),
    delivery_preview: preview,
    created_at: toStringOrNull(row.created_at),
  };
}

export function normalizeDeliverySourceDirectSalePrefill(payload: unknown): DeliverySourceDirectSalePrefill {
  const root = (payload ?? {}) as Record<string, unknown>;
  const defaults = (root.defaults ?? {}) as Record<string, unknown>;
  return {
    source: normalizeDeliverySourceDirectSale(root.source),
    defaults: {
      receiver_name: toStringOrNull(defaults.receiver_name) ?? "",
      receiver_phone: toStringOrNull(defaults.receiver_phone) ?? "",
      delivery_address_snapshot: toStringOrNull(defaults.delivery_address_snapshot) ?? "",
      notes: toStringOrNull(defaults.notes) ?? "",
    },
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
  if (params.include_direct_sale_cases === false) {
    search.set("include_direct_sale_cases", "false");
  }
  if (params.source_type && params.source_type !== "ALL") {
    search.set("source_type", params.source_type);
  }
  if (params.sale?.trim()) {
    search.set("sale", params.sale.trim());
  }
  if (params.invoice?.trim()) {
    search.set("invoice", params.invoice.trim());
  }

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

export async function createAdminDelivery(
  payload:
    | {
        subscription: number;
        status?: "PENDING" | "SCHEDULED";
        delivery_reference?: string;
        scheduled_date?: string | null;
        receiver_name?: string;
        receiver_phone?: string;
        delivery_address_snapshot?: string;
        notes?: string;
      }
    | { direct_sale: number }
): Promise<DeliveryRecord> {
  const response = await apiFetch<unknown>("/admin/deliveries/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeDeliveryRecord(response);
}

export async function listAdminDeliverySourceDirectSales(params: {
  q?: string;
  limit?: number;
}): Promise<DeliverySourceDirectSalesResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (typeof params.limit === "number") search.set("limit", String(params.limit));
  const query = search.toString();
  const payload = await apiFetch<unknown>(`/admin/deliveries/sources/direct-sales/${query ? `?${query}` : ""}`);
  const root = (payload ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results) ? root.results : [];
  return {
    count: toNumber(root.count, 0),
    results: results.map(normalizeDeliverySourceDirectSale),
  };
}

export async function getAdminDeliverySourceDirectSalePrefill(
  directSaleId: number | string
): Promise<DeliverySourceDirectSalePrefill> {
  const payload = await apiFetch<unknown>(`/admin/deliveries/sources/direct-sales/${directSaleId}/prefill/`);
  return normalizeDeliverySourceDirectSalePrefill(payload);
}

export async function listAdminDeliverySourceSubscriptions(params: {
  q?: string;
  plan_type?: SubscriptionPlanType;
  limit?: number;
}): Promise<DeliverySourceSubscriptionsResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.plan_type) search.set("plan_type", params.plan_type);
  if (typeof params.limit === "number") search.set("limit", String(params.limit));
  const query = search.toString();
  const payload = await apiFetch<unknown>(`/admin/deliveries/sources/subscriptions/${query ? `?${query}` : ""}`);
  return normalizeDeliverySourceSubscriptionsResponse(payload);
}

export async function getAdminDeliverySourceSubscriptionPrefill(
  subscriptionId: number | string
): Promise<DeliverySourceSubscriptionPrefill> {
  const payload = await apiFetch<unknown>(
    `/admin/deliveries/sources/subscriptions/${subscriptionId}/prefill/`
  );
  return normalizeDeliverySourceSubscriptionPrefill(payload);
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

async function postDirectSaleCaseAction(path: string, payload: Record<string, unknown>): Promise<DeliveryRecord> {
  const response = await apiFetch<{ delivery?: unknown }>(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeDeliveryRecord(response?.delivery ?? {});
}

export async function scheduleDirectSaleDeliveryCase(
  caseId: number | string,
  payload: {
    scheduled_date?: string | null;
    receiver_name?: string;
    receiver_phone?: string;
    delivery_address_snapshot?: string;
    notes?: string;
  }
): Promise<DeliveryRecord> {
  return postDirectSaleCaseAction(`/admin/deliveries/direct-sale-cases/${caseId}/schedule/`, payload);
}

export async function dispatchDirectSaleDeliveryCase(
  caseId: number | string,
  payload: { notes?: string } = {}
): Promise<DeliveryRecord> {
  return postDirectSaleCaseAction(`/admin/deliveries/direct-sale-cases/${caseId}/dispatch/`, payload);
}

export async function markDirectSaleDeliveryCaseDelivered(
  caseId: number | string,
  payload: {
    receiver_name?: string;
    receiver_phone?: string;
    delivery_note?: string;
    delivered_at?: string | null;
  }
): Promise<DeliveryRecord> {
  return postDirectSaleCaseAction(`/admin/deliveries/direct-sale-cases/${caseId}/mark-delivered/`, payload);
}

export async function cancelDirectSaleDeliveryCase(
  caseId: number | string,
  payload: { reason: string; notes?: string }
): Promise<DeliveryRecord> {
  return postDirectSaleCaseAction(`/admin/deliveries/direct-sale-cases/${caseId}/cancel/`, payload);
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
