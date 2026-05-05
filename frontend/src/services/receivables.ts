import { request } from "@/services/api";

export type ReceivableSourceType =
  | "ADVANCE_EMI"
  | "RENT"
  | "LEASE"
  | "DIRECT_SALE";

export type CollectionPrimaryAction =
  | "COLLECT_EMI"
  | "COLLECT_DIRECT_SALE"
  | "OPEN_SALE"
  | "VIEW_RECEIPTS"
  | "VIEW_ONLY"
  | "DISABLED";

/** Canonical badge/category from unified search API (`result_type`). Optional extras only when API sends them. */
export type UnifiedReceivableResultType =
  | "EMI"
  | "DIRECT_SALE"
  | "DIRECT_SALE_DRAFT"
  | "DIRECT_SALE_RECEIVABLE"
  | "DIRECT_SALE_PAID"
  | "RENT"
  | "LEASE"
  | "DEPOSIT"
  | "RECEIPT"
  | "CUSTOMER";

export type UnifiedReceivableResult = {
  /** Server-provided classification for cashier UX badges (additive). */
  result_type: UnifiedReceivableResultType | "";
  /** Mirrors primary_action for stable routing diagnostics. */
  action_type: string;
  collectible?: boolean;
  collection_workflow?: string;
  reason_if_not_collectible?: string | null;
  secondary_badges?: UnifiedReceivableResultType[];
  source_type: ReceivableSourceType;
  source_id: number | null;
  contract_reference_id: number | null;
  reference_no: string;
  display_reference: string;
  customer_id: number | null;
  customer_name: string;
  phone_masked: string;
  product_summary: string;
  due_amount: string;
  paid_amount: string;
  total_amount: string;
  overdue_amount: string;
  next_due_date: string | null;
  status: string;
  payment_state: string;
  primary_action: CollectionPrimaryAction;
  allowed_actions: string[];
  disabled_reason: string | null;
  collection_route: string;
  action_url?: string;
  is_overdue?: boolean;
  due_date?: string | null;
  operational_state?: string;
  next_actions?: string[];
  blocking_reasons?: string[];
  inventory_state?: string;
  delivery_state?: string;
  collection_state?: string;
};

export type UnifiedReceivableSearchResponse = {
  count: number;
  results: UnifiedReceivableResult[];
};

export type UnifiedReceivablePreviewResponse = {
  source_type: ReceivableSourceType;
  source_id: number;
  requested_amount: string;
  pending_dues: Array<Record<string, unknown>>;
  allocation_preview: Array<Record<string, unknown>>;
  unallocated_amount: string;
  overpayment_warning: boolean;
  disabled_reason?: string;
  mutates_data: false;
};

function buildQuery(query: string): string {
  const search = new URLSearchParams();
  const trimmed = query.trim();
  if (trimmed) search.set("q", trimmed);
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

function normalizeSourceType(value: unknown): ReceivableSourceType {
  const sourceType = String(value || "").toUpperCase();
  if (sourceType === "RENT") return "RENT";
  if (sourceType === "LEASE") return "LEASE";
  if (sourceType === "DIRECT_SALE") return "DIRECT_SALE";
  return "ADVANCE_EMI";
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizePrimaryAction(value: unknown): CollectionPrimaryAction {
  const v = String(value || "").toUpperCase();
  if (v === "COLLECT_DIRECT_SALE") return "COLLECT_DIRECT_SALE";
  if (v === "OPEN_SALE") return "OPEN_SALE";
  if (v === "VIEW_RECEIPTS") return "VIEW_RECEIPTS";
  if (v === "VIEW_ONLY") return "VIEW_ONLY";
  if (v === "DISABLED") return "DISABLED";
  return "COLLECT_EMI";
}

function normalizeResultType(
  raw: unknown,
  sourceType: ReceivableSourceType,
): UnifiedReceivableResultType | "" {
  const token = String(raw || "").trim().toUpperCase();
  const allowed: UnifiedReceivableResultType[] = [
    "EMI",
    "DIRECT_SALE",
    "DIRECT_SALE_DRAFT",
    "DIRECT_SALE_RECEIVABLE",
    "DIRECT_SALE_PAID",
    "RENT",
    "LEASE",
    "DEPOSIT",
    "RECEIPT",
    "CUSTOMER",
  ];
  if (allowed.includes(token as UnifiedReceivableResultType)) {
    return token as UnifiedReceivableResultType;
  }
  if (sourceType === "ADVANCE_EMI") return "EMI";
  if (sourceType === "DIRECT_SALE") return "DIRECT_SALE";
  if (sourceType === "RENT") return "RENT";
  if (sourceType === "LEASE") return "LEASE";
  return "";
}

function normalizeReceivable(row: Record<string, unknown>): UnifiedReceivableResult {
  const routeRaw = toStringValue(row.collection_route);
  const source_type = normalizeSourceType(row.source_type);
  const primary_action = normalizePrimaryAction(row.primary_action);
  const action_type = toStringValue(row.action_type) || String(primary_action);
  const secondaryRaw = row.secondary_badges ?? row.secondary_result_types;
  const secondary_badges = Array.isArray(secondaryRaw)
    ? secondaryRaw
        .map((item) => String(item || "").trim().toUpperCase())
        .filter((item): item is UnifiedReceivableResultType =>
          ["DEPOSIT", "RECEIPT", "CUSTOMER", "EMI", "DIRECT_SALE", "RENT", "LEASE"].includes(item)
        )
    : undefined;
  return {
    result_type: normalizeResultType(row.result_type, source_type),
    action_type,
    collectible: Boolean(row.collectible),
    collection_workflow: toStringValue(row.collection_workflow),
    reason_if_not_collectible:
      typeof row.reason_if_not_collectible === "string" || row.reason_if_not_collectible === null
        ? row.reason_if_not_collectible
        : null,
    secondary_badges,
    source_type,
    source_id: toNumberOrNull(row.source_id),
    contract_reference_id: toNumberOrNull(row.contract_reference_id),
    reference_no: toStringValue(row.reference_no),
    display_reference: toStringValue(row.display_reference) || toStringValue(row.reference_no),
    customer_id: toNumberOrNull(row.customer_id),
    customer_name: toStringValue(row.customer_name),
    phone_masked: toStringValue(row.phone_masked),
    product_summary: toStringValue(row.product_summary),
    due_amount: toMoneyString(row.due_amount),
    paid_amount: toMoneyString(row.paid_amount),
    total_amount: toMoneyString(row.total_amount),
    overdue_amount: toMoneyString(row.overdue_amount),
    next_due_date:
      typeof row.next_due_date === "string" || row.next_due_date === null
        ? row.next_due_date
        : null,
    status: toStringValue(row.status),
    payment_state: toStringValue(row.payment_state),
    primary_action,
    allowed_actions: Array.isArray(row.allowed_actions)
      ? row.allowed_actions.filter((item): item is string => typeof item === "string")
      : [],
    disabled_reason:
      typeof row.disabled_reason === "string" || row.disabled_reason === null
        ? row.disabled_reason
        : null,
    collection_route: routeRaw,
    action_url: toStringValue(row.action_url),
    is_overdue: Boolean(row.is_overdue),
    due_date:
      typeof row.due_date === "string" || row.due_date === null
        ? row.due_date
        : null,
    operational_state: toStringValue(row.operational_state),
    next_actions: Array.isArray(row.next_actions) ? row.next_actions.map((item) => String(item)) : [],
    blocking_reasons: Array.isArray(row.blocking_reasons) ? row.blocking_reasons.map((item) => String(item)) : [],
    inventory_state: toStringValue(row.inventory_state),
    delivery_state: toStringValue(row.delivery_state),
    collection_state: toStringValue(row.collection_state),
  };
}

async function searchReceivables(
  path: string,
  query: string
): Promise<UnifiedReceivableSearchResponse> {
  const payload = await request<Record<string, unknown>>(`${path}${buildQuery(query)}`);
  const rawRows = Array.isArray(payload.results) ? payload.results : [];
  return {
    count: Number(payload.count ?? rawRows.length),
    results: rawRows.map((item) =>
      normalizeReceivable(item as Record<string, unknown>)
    ),
  };
}

export function searchAdminReceivables(
  query: string
): Promise<UnifiedReceivableSearchResponse> {
  return searchReceivables("/admin/receivables/search/", query);
}

export function searchCashierReceivables(
  query: string
): Promise<UnifiedReceivableSearchResponse> {
  return searchReceivables("/cashier/receivables/search/", query);
}

export function resolveAdminContractReference(
  contractReferenceId: number
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(
    `/admin/contract-references/${contractReferenceId}/resolve/`
  );
}

export function previewAdminReceivableAllocation(payload: {
  source_type: ReceivableSourceType;
  source_id: number;
  amount: string;
}): Promise<UnifiedReceivablePreviewResponse> {
  return request<UnifiedReceivablePreviewResponse>("/admin/receivables/preview/", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  } as RequestInit);
}

export function previewCashierReceivableAllocation(payload: {
  source_type: ReceivableSourceType;
  source_id: number;
  amount: string;
}): Promise<UnifiedReceivablePreviewResponse> {
  return request<UnifiedReceivablePreviewResponse>("/cashier/receivables/preview/", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  } as RequestInit);
}

