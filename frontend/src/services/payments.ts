import { request } from "@/services/api";

export type PaymentMethod = "CASH" | "UPI" | "BANK" | "CARD";

export type PaymentCollectionPayload = {
  emi: number;
  amount: string;
  payment_method: PaymentMethod;
  payment_date: string;
  finance_account_id: number;
  branch_id?: number;
  cash_counter_id?: number;
  reference_no?: string;
  notes?: string;
  idempotency_key?: string;
};

export type PaymentCollectPayload = PaymentCollectionPayload;

export type PaymentCollectionResult = {
  message?: string;
  created?: boolean;
  payment: {
    id: number;
    amount: string;
    method?: PaymentMethod;
    payment_method?: PaymentMethod;
    branch_id?: number | null;
    branch_code?: string | null;
    branch_name?: string | null;
    cash_counter_id?: number | null;
    cash_counter_code?: string | null;
    cash_counter_name?: string | null;
    payment_date: string;
    reference_no?: string | null;
    notes?: string | null;
    is_reversed?: boolean;
    reversal_metadata?: Record<string, unknown> | null;
  };
  emi: {
    id: number;
    status: string;
    amount?: string;
    paid_amount?: string;
    outstanding_amount: string;
    due_date?: string;
    subscription?: number;
  };
  subscription?: {
    id: number;
    subscription_number?: string;
    status?: string;
  };
  finance_account?: {
    id: number;
    name: string;
    kind: "CASH" | "BANK" | "UPI";
    chart_account_id?: number | null;
    chart_account_code?: string | null;
  } | null;
  reconciliation_status?: string | null;
  detail?: string;
};

export type PaymentRegisterResponse = PaymentCollectionResult;

export type AdminSubscriptionCollectionCandidate = {
  id: number;
  subscription_number?: string;
  customer?: number;
  customer_name?: string;
  customer_phone?: string;
  batch?: number | null;
  batch_code?: string | null;
  lucky_id?: number | null;
  lucky_number?: string | number | null;
  product?: number | null;
  product_name?: string | null;
  monthly_amount?: string;
  total_amount?: string;
  tenure_months?: number;
  status?: string;
  plan_type?: string;
};

export type AdminEmiCollectionCandidate = {
  id: number;
  subscription: number;
  installment_no?: number;
  month_no?: number;
  due_date?: string;
  amount: string;
  paid_amount?: string;
  outstanding_amount?: string;
  waived_amount?: string;
  status: string;
};

export type PaymentRegisterRow = {
  id: number;
  amount: string;
  branch_id?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  cash_counter_id?: number | null;
  cash_counter_code?: string | null;
  cash_counter_name?: string | null;
  method?: string;
  reference_no?: string | null;
  payment_date?: string;
  customer_name?: string;
  customer_phone?: string;
  subscription?: number | null;
  subscription_number?: string;
  batch_code?: string | null;
  lucky_number?: number | null;
  emi?: number | null;
  collected_by_username?: string | null;
  verified_by_username?: string | null;
  is_reversed: boolean;
};

export type PaymentRegisterSummary = {
  visible_payments: number;
  gross_amount: string;
  active_payments: number;
  active_amount: string;
  reversed_payments: number;
  reversed_amount: string;
  net_collected_amount: string;
};

export type PaymentRegisterListResponse = {
  results: PaymentRegisterRow[];
  summary: PaymentRegisterSummary;
};

export type PaymentRecord = {
  id: number;
  customer?: number;
  customer_name?: string;
  customer_phone?: string;
  subscription: number;
  subscription_status?: string;
  subscription_number?: string;
  emi?: number | null;
  emi_month_no?: number | null;
  batch?: number | null;
  batch_code?: string | null;
  branch_id?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  cash_counter_id?: number | null;
  cash_counter_code?: string | null;
  cash_counter_name?: string | null;
  lucky_number?: number | null;
  amount: string;
  method: string;
  reference_no?: string | null;
  payment_date: string;
  paid_at?: string;
  collected_by?: number | null;
  collected_by_username?: string | null;
  verified_by?: number | null;
  verified_by_username?: string | null;
  created_at?: string;
  allocation_metadata?: Record<string, unknown> | null;
  is_reversed?: boolean;
};

export type PaymentListResponse = {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: PaymentRecord[];
  total_paid_amount?: string | number;
};

export type PaymentReversePayload = {
  reason: string;
};

export type PaymentReverseResponse = {
  detail: string;
  payment_id: number;
  emi?: {
    id: number;
    status: string;
  };
  subscription?: {
    id: number;
    status: string;
  };
};

export type PaymentTimelineLedgerEntry = {
  id: number;
  emi_id?: number | null;
  amount?: string;
  entry_type?: string;
  entry_direction?: string;
  allocation_context?: Record<string, unknown>;
  created_at: string;
};

export type PaymentTimelineAuditEntry = {
  id: number;
  action_type?: string;
  performed_by?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type PaymentTimelineUnifiedEntry = {
  kind: "ledger" | "reversal_ledger" | "audit";
  timestamp: string;
  payload: Record<string, unknown>;
};

export type PaymentTimelineResponse = {
  payment: PaymentRecord;
  flags?: {
    is_reversed?: boolean;
  };
  reversal?: {
    is_reversed?: boolean;
    reason?: string;
    reversed_by_id?: number | null;
    reversed_by_username?: string | null;
  };
  ledger_entries?: PaymentTimelineLedgerEntry[];
  reversal_ledger_entries?: PaymentTimelineLedgerEntry[];
  audit_logs?: PaymentTimelineAuditEntry[];
  timeline?: PaymentTimelineUnifiedEntry[];
};

type PaginatedResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

type RawPaymentRegisterRow = Record<string, unknown>;

type RawPaymentRegisterResponse = {
  results?: RawPaymentRegisterRow[];
  summary?: Partial<PaymentRegisterSummary>;
};

const EMPTY_PAYMENT_REGISTER_SUMMARY: PaymentRegisterSummary = {
  visible_payments: 0,
  gross_amount: "0.00",
  active_payments: 0,
  active_amount: "0.00",
  reversed_payments: 0,
  reversed_amount: "0.00",
  net_collected_amount: "0.00",
};

const paymentCollectionIdempotencyKeys = new Map<string, string>();

function buildClientCollectionKey(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) return `client-payment:${randomUUID}`;
  return `client-payment:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function normalizeCollectionPayload(
  payload: PaymentCollectionPayload
): PaymentCollectionPayload {
  if (payload.idempotency_key?.trim()) {
    return payload;
  }

  const signature = JSON.stringify({
    emi: payload.emi,
    amount: payload.amount,
    payment_method: payload.payment_method,
    payment_date: payload.payment_date,
    finance_account_id: payload.finance_account_id,
    branch_id: payload.branch_id ?? null,
    cash_counter_id: payload.cash_counter_id ?? null,
    reference_no: payload.reference_no?.trim() || null,
  });

  let key = paymentCollectionIdempotencyKeys.get(signature);
  if (!key) {
    key = buildClientCollectionKey();
    paymentCollectionIdempotencyKeys.set(signature, key);
  }

  return {
    ...payload,
    idempotency_key: key,
  };
}

function toArray<T>(payload: T[] | PaginatedResponse<T> | null | undefined): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function parseBooleanFromUnknown(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizePaymentRegisterRow(row: RawPaymentRegisterRow): PaymentRegisterRow {
  const subscriptionId =
    typeof row.subscription === "number"
      ? row.subscription
      : typeof row.subscription_id === "number"
        ? row.subscription_id
        : null;

  const metadata =
    row.allocation_metadata && typeof row.allocation_metadata === "object"
      ? (row.allocation_metadata as Record<string, unknown>)
      : null;

  const reversal =
    metadata?.reversal && typeof metadata.reversal === "object"
      ? (metadata.reversal as Record<string, unknown>)
      : null;

  return {
    id: Number(row.id ?? 0),
    amount: String(row.amount ?? "0.00"),
    branch_id: toNumberOrNull(row.branch_id),
    branch_code:
      typeof row.branch_code === "string" || row.branch_code === null
        ? (row.branch_code as string | null)
        : undefined,
    branch_name:
      typeof row.branch_name === "string" || row.branch_name === null
        ? (row.branch_name as string | null)
        : undefined,
    cash_counter_id: toNumberOrNull(row.cash_counter_id),
    cash_counter_code:
      typeof row.cash_counter_code === "string" || row.cash_counter_code === null
        ? (row.cash_counter_code as string | null)
        : undefined,
    cash_counter_name:
      typeof row.cash_counter_name === "string" || row.cash_counter_name === null
        ? (row.cash_counter_name as string | null)
        : undefined,
    method: typeof row.method === "string" ? row.method : undefined,
    reference_no:
      typeof row.reference_no === "string" || row.reference_no === null
        ? (row.reference_no as string | null)
        : undefined,
    payment_date:
      typeof row.payment_date === "string" ? row.payment_date : undefined,
    customer_name:
      typeof row.customer_name === "string" ? row.customer_name : undefined,
    customer_phone:
      typeof row.customer_phone === "string" ? row.customer_phone : undefined,
    subscription: subscriptionId,
    subscription_number:
      typeof row.subscription_number === "string"
        ? row.subscription_number
        : subscriptionId !== null
          ? `SUB-${subscriptionId}`
          : undefined,
    batch_code:
      typeof row.batch_code === "string" || row.batch_code === null
        ? (row.batch_code as string | null)
        : undefined,
    lucky_number:
      typeof row.lucky_number === "number" ? row.lucky_number : undefined,
    emi:
      typeof row.emi === "number"
        ? row.emi
        : typeof row.emi_id === "number"
          ? row.emi_id
          : undefined,
    collected_by_username:
      typeof row.collected_by_username === "string" ||
      row.collected_by_username === null
        ? (row.collected_by_username as string | null)
        : undefined,
    verified_by_username:
      typeof row.verified_by_username === "string" ||
      row.verified_by_username === null
        ? (row.verified_by_username as string | null)
        : undefined,
    is_reversed:
      parseBooleanFromUnknown(row.is_reversed) ||
      parseBooleanFromUnknown(reversal?.is_reversed),
  };
}

function normalizePaymentRegisterSummary(
  summary: Partial<PaymentRegisterSummary> | undefined
): PaymentRegisterSummary {
  return {
    visible_payments: Number(summary?.visible_payments ?? 0),
    gross_amount: String(summary?.gross_amount ?? "0.00"),
    active_payments: Number(summary?.active_payments ?? 0),
    active_amount: String(summary?.active_amount ?? "0.00"),
    reversed_payments: Number(summary?.reversed_payments ?? 0),
    reversed_amount: String(summary?.reversed_amount ?? "0.00"),
    net_collected_amount: String(summary?.net_collected_amount ?? "0.00"),
  };
}

function normalizePaymentRecord(row: Record<string, unknown>): PaymentRecord {
  const metadata =
    row.allocation_metadata && typeof row.allocation_metadata === "object"
      ? (row.allocation_metadata as Record<string, unknown>)
      : null;

  const reversal =
    metadata?.reversal && typeof metadata.reversal === "object"
      ? (metadata.reversal as Record<string, unknown>)
      : null;

  return {
    id: Number(row.id ?? 0),
    customer: toNumberOrNull(row.customer) ?? undefined,
    customer_name: toStringOrUndefined(row.customer_name),
    customer_phone: toStringOrUndefined(row.customer_phone),
    subscription: Number(row.subscription ?? 0),
    subscription_status: toStringOrUndefined(row.subscription_status),
    subscription_number: toStringOrUndefined(row.subscription_number),
    emi: toNumberOrNull(row.emi),
    emi_month_no: toNumberOrNull(row.emi_month_no),
    batch: toNumberOrNull(row.batch),
    batch_code:
      typeof row.batch_code === "string" || row.batch_code === null
        ? (row.batch_code as string | null)
        : undefined,
    branch_id: toNumberOrNull(row.branch_id),
    branch_code:
      typeof row.branch_code === "string" || row.branch_code === null
        ? (row.branch_code as string | null)
        : undefined,
    branch_name:
      typeof row.branch_name === "string" || row.branch_name === null
        ? (row.branch_name as string | null)
        : undefined,
    cash_counter_id: toNumberOrNull(row.cash_counter_id),
    cash_counter_code:
      typeof row.cash_counter_code === "string" || row.cash_counter_code === null
        ? (row.cash_counter_code as string | null)
        : undefined,
    cash_counter_name:
      typeof row.cash_counter_name === "string" || row.cash_counter_name === null
        ? (row.cash_counter_name as string | null)
        : undefined,
    lucky_number: toNumberOrNull(row.lucky_number),
    amount: String(row.amount ?? "0.00"),
    method: String(row.method ?? ""),
    reference_no:
      typeof row.reference_no === "string" || row.reference_no === null
        ? (row.reference_no as string | null)
        : undefined,
    payment_date: String(row.payment_date ?? ""),
    paid_at: toStringOrUndefined(row.paid_at),
    collected_by: toNumberOrNull(row.collected_by),
    collected_by_username:
      typeof row.collected_by_username === "string" ||
      row.collected_by_username === null
        ? (row.collected_by_username as string | null)
        : undefined,
    verified_by: toNumberOrNull(row.verified_by),
    verified_by_username:
      typeof row.verified_by_username === "string" ||
      row.verified_by_username === null
        ? (row.verified_by_username as string | null)
        : undefined,
    created_at: toStringOrUndefined(row.created_at),
    allocation_metadata: metadata,
    is_reversed:
      parseBooleanFromUnknown(row.is_reversed) ||
      parseBooleanFromUnknown(reversal?.is_reversed),
  };
}

function buildPaymentRegisterQuery(params: {
  q?: string;
  method?: string;
  reversalState?: string;
  dateFrom?: string;
  dateTo?: string;
  subscription?: number | string;
  customer?: number | string;
  batch?: number | string;
  partner?: number | string;
  emi?: number | string;
  page?: number;
}) {
  const search = new URLSearchParams();

  if (params.q) search.set("q", String(params.q));
  if (params.method) search.set("method", params.method);
  if (params.reversalState) search.set("reversal_state", params.reversalState);
  if (params.dateFrom) search.set("date_from", params.dateFrom);
  if (params.dateTo) search.set("date_to", params.dateTo);
  if (params.subscription) search.set("subscription", String(params.subscription));
  if (params.customer) search.set("customer", String(params.customer));
  if (params.batch) search.set("batch", String(params.batch));
  if (params.partner) search.set("partner", String(params.partner));
  if (params.emi) search.set("emi", String(params.emi));
  if (params.page) search.set("page", String(params.page));

  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function collectPayment(
  payload: PaymentCollectionPayload
): Promise<PaymentCollectionResult> {
  const safePayload = normalizeCollectionPayload(payload);
  return request<PaymentCollectionResult>("/admin/payments/collect/", {
    method: "POST",
    body: JSON.stringify(safePayload),
    headers: {
      "Content-Type": "application/json",
    },
  } as RequestInit);
}

export async function reversePayment(
  paymentId: number | string,
  payload: PaymentReversePayload
): Promise<PaymentReverseResponse> {
  return request<PaymentReverseResponse>(
    `/admin/payments/${paymentId}/reverse/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
    } as RequestInit
  );
}

export async function getPayment(
  paymentId: number | string
): Promise<PaymentRecord> {
  const payload = await request<Record<string, unknown>>(
    `/admin/payments/${paymentId}/`,
    {
      method: "GET",
    } as RequestInit
  );

  return normalizePaymentRecord(payload ?? {});
}

export async function getPaymentTimeline(
  paymentId: number | string
): Promise<PaymentTimelineResponse> {
  return request<PaymentTimelineResponse>(
    `/admin/payments/${paymentId}/timeline/`,
    {
      method: "GET",
    } as RequestInit
  );
}

export async function listPayments(params?: {
  q?: string;
  method?: string;
  reversalState?: string;
  dateFrom?: string;
  dateTo?: string;
  subscription?: number | string;
  customer?: number | string;
  batch?: number | string;
  partner?: number | string;
  emi?: number | string;
  page?: number;
}): Promise<PaymentListResponse> {
  const payload = await request<PaginatedResponse<Record<string, unknown>> & {
    total_paid_amount?: string | number;
  }>(`/admin/payments/${buildPaymentRegisterQuery(params ?? {})}`, {
    method: "GET",
  } as RequestInit);

  const rawRows = Array.isArray(payload?.results) ? payload.results : [];

  return {
    count: Number(payload?.count ?? 0),
    next: payload?.next ?? null,
    previous: payload?.previous ?? null,
    total_paid_amount: payload?.total_paid_amount ?? "0.00",
    results: rawRows.map(normalizePaymentRecord),
  };
}

export async function getAdminSubscriptionForCollection(
  subscriptionId: number
): Promise<AdminSubscriptionCollectionCandidate> {
  return request<AdminSubscriptionCollectionCandidate>(
    `/admin/subscriptions/${subscriptionId}/`,
    {
      method: "GET",
    } as RequestInit
  );
}

export async function searchAdminSubscriptionsForCollection(
  query: string
): Promise<AdminSubscriptionCollectionCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const payload = await request<
    | AdminSubscriptionCollectionCandidate[]
    | PaginatedResponse<AdminSubscriptionCollectionCandidate>
  >(`/admin/subscriptions/?q=${encodeURIComponent(trimmed)}`, {
    method: "GET",
  } as RequestInit);

  return toArray(payload);
}

export async function listSubscriptionEmisForCollection(
  subscriptionId: number
): Promise<AdminEmiCollectionCandidate[]> {
  const payload = await request<
    AdminEmiCollectionCandidate[] | PaginatedResponse<AdminEmiCollectionCandidate>
  >(
    `/admin/emis/?subscription=${subscriptionId}&ordering=due_date`,
    {
      method: "GET",
    } as RequestInit
  );

  return toArray(payload);
}

export async function getAdminPaymentRegister(params?: {
  q?: string;
  method?: string;
  reversalState?: string;
  dateFrom?: string;
  dateTo?: string;
  subscription?: number | string;
  customer?: number | string;
  batch?: number | string;
  partner?: number | string;
  emi?: number | string;
}): Promise<PaymentRegisterListResponse> {
  const payload = await request<RawPaymentRegisterResponse>(
    `/admin/payments/${buildPaymentRegisterQuery(params ?? {})}`,
    {
      method: "GET",
    } as RequestInit
  );

  const rows = Array.isArray(payload?.results) ? payload.results : [];
  return {
    results: rows.map(normalizePaymentRegisterRow),
    summary: normalizePaymentRegisterSummary(payload?.summary),
  };
}
