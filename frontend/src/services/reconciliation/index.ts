import { request } from "@/services/api";
import { toResultsArray } from "@/services/api/list";

export type ReconciliationEventRecord = {
  id: number;
  event_type: string;
  old_status?: string;
  new_status?: string;
  message?: string;
  actor?: number | null;
  actor_username?: string | null;
  created_at: string;
};

export type ReconciliationRecord = {
  id: number;
  payment?: number;
  payment_id?: number;
  subscription_id?: number;
  subscription_number: string;
  emi_id?: number | null;
  customer_name?: string;
  payment_amount?: string;
  payment_reference_no?: string | null;
  payment_date?: string;
  matched_emi?: number | null;
  status: string;
  expected_amount: string;
  paid_amount: string;
  variance_amount: string;
  is_flagged: boolean;
  is_locked: boolean;
  notes?: string;
  reconciled_by?: number | null;
  reconciled_at?: string | null;
  created_at: string;
  updated_at?: string;
  events?: ReconciliationEventRecord[];

  variance: number;
  payment_amount_value: number;
  expected_amount_value: number;
  paid_amount_value: number;
};

export type ReconciliationListParams = {
  status?: string;
  flagged?: boolean;
  locked?: boolean;
  payment?: number | string;
  subscription?: number | string;
  q?: string;
};

export type ReconciliationActionPayload = {
  note?: string;
  reason?: string;
};

type RawReconciliationRecord = Partial<ReconciliationRecord> & {
  subscription?: number | string | null;
  payment?: number | string | null;
};

type ReconciliationListResponse =
  | RawReconciliationRecord[]
  | {
      count?: number;
      results?: RawReconciliationRecord[];
    };

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}



function toBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function buildQuery(params?: ReconciliationListParams): string {
  if (!params) return "";

  const search = new URLSearchParams();

  if (params.status) search.set("status", params.status);
  if (typeof params.flagged === "boolean") {
    search.set("flagged", String(params.flagged));
  }
  if (typeof params.locked === "boolean") {
    search.set("locked", String(params.locked));
  }
  if (params.payment !== undefined && params.payment !== "") {
    search.set("payment", String(params.payment));
  }
  if (params.subscription !== undefined && params.subscription !== "") {
    search.set("subscription", String(params.subscription));
  }
  if (params.q) search.set("q", params.q);

  const query = search.toString();
  return query ? `?${query}` : "";
}

function normalizeRecord(row: RawReconciliationRecord): ReconciliationRecord {
  const subscriptionId =
    typeof row.subscription_id === "number"
      ? row.subscription_id
      : toOptionalNumber(row.subscription);

  const paymentId =
    typeof row.payment_id === "number"
      ? row.payment_id
      : toOptionalNumber(row.payment);

  const subscriptionNumber =
    asTrimmedString(row.subscription_number) ||
    (subscriptionId !== undefined ? `SUB-${subscriptionId}` : "—");

  return {
    id: toNumber(row.id),
    payment: paymentId,
    payment_id: paymentId,
    subscription_id: subscriptionId,
    subscription_number: subscriptionNumber,
    emi_id:
      row.emi_id === null || row.emi_id === undefined
        ? null
        : toNumber(row.emi_id),
    customer_name: asTrimmedString(row.customer_name) || undefined,
    payment_amount: String(row.payment_amount ?? "0"),
    payment_reference_no:
      row.payment_reference_no === null
        ? null
        : asTrimmedString(row.payment_reference_no) || undefined,
    payment_date: asTrimmedString(row.payment_date) || undefined,
    matched_emi:
      row.matched_emi === null || row.matched_emi === undefined
        ? null
        : toNumber(row.matched_emi),
    status: asTrimmedString(row.status) || "PENDING",
    expected_amount: String(row.expected_amount ?? "0"),
    paid_amount: String(row.paid_amount ?? "0"),
    variance_amount: String(row.variance_amount ?? "0"),
    is_flagged: toBoolean(row.is_flagged),
    is_locked: toBoolean(row.is_locked),
    notes: asTrimmedString(row.notes) || undefined,
    reconciled_by:
      row.reconciled_by === null || row.reconciled_by === undefined
        ? null
        : toNumber(row.reconciled_by),
    reconciled_at:
      row.reconciled_at === null
        ? null
        : asTrimmedString(row.reconciled_at) || undefined,
    created_at: asTrimmedString(row.created_at),
    updated_at: asTrimmedString(row.updated_at) || undefined,
    events: Array.isArray(row.events) ? row.events : [],
    variance: toNumber(row.variance_amount),
    payment_amount_value: toNumber(row.payment_amount),
    expected_amount_value: toNumber(row.expected_amount),
    paid_amount_value: toNumber(row.paid_amount),
  };
}

export async function listReconciliations(
  params?: ReconciliationListParams
): Promise<ReconciliationRecord[]> {
  const payload = await request<ReconciliationListResponse>(
    `/admin/reconciliations/${buildQuery(params)}`
  );

  return toResultsArray<RawReconciliationRecord>(payload).map(normalizeRecord);
}

export async function getReconciliation(
  id: number | string
): Promise<ReconciliationRecord> {
  const payload = await request<RawReconciliationRecord>(
    `/admin/reconciliations/${id}/`
  );

  return normalizeRecord(payload);
}

export async function flagReconciliation(
  id: number | string,
  payload: ReconciliationActionPayload
) {
  return request(`/admin/reconciliations/${id}/flag/`, {
    method: "POST",
    body: JSON.stringify(payload),
    retryCount: 0,
  });
}

export async function noteReconciliation(
  id: number | string,
  payload: ReconciliationActionPayload
) {
  return request(`/admin/reconciliations/${id}/note/`, {
    method: "POST",
    body: JSON.stringify(payload),
    retryCount: 0,
  });
}

export async function lockReconciliation(
  id: number | string,
  payload: ReconciliationActionPayload
) {
  return request(`/admin/reconciliations/${id}/lock/`, {
    method: "POST",
    body: JSON.stringify(payload),
    retryCount: 0,
  });
}

export async function unlockReconciliation(
  id: number | string,
  payload: ReconciliationActionPayload
) {
  return request(`/admin/reconciliations/${id}/unlock/`, {
    method: "POST",
    body: JSON.stringify(payload),
    retryCount: 0,
  });
}