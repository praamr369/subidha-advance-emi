import { request } from "@/services/api";

export type ReceivableSourceType =
  | "ADVANCE_EMI"
  | "RENT"
  | "LEASE"
  | "DIRECT_SALE";

export type UnifiedReceivableResult = {
  source_type: ReceivableSourceType;
  source_id: number | null;
  reference_no: string;
  display_reference: string;
  customer_id: number | null;
  customer_name: string;
  phone_masked: string;
  product_summary: string;
  due_amount: string;
  overdue_amount: string;
  next_due_date: string | null;
  status: string;
  allowed_actions: string[];
  disabled_reason: string | null;
};

export type UnifiedReceivableSearchResponse = {
  count: number;
  results: UnifiedReceivableResult[];
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

function normalizeReceivable(row: Record<string, unknown>): UnifiedReceivableResult {
  return {
    source_type: normalizeSourceType(row.source_type),
    source_id: toNumberOrNull(row.source_id),
    reference_no: toStringValue(row.reference_no),
    display_reference: toStringValue(row.display_reference) || toStringValue(row.reference_no),
    customer_id: toNumberOrNull(row.customer_id),
    customer_name: toStringValue(row.customer_name),
    phone_masked: toStringValue(row.phone_masked),
    product_summary: toStringValue(row.product_summary),
    due_amount: toMoneyString(row.due_amount),
    overdue_amount: toMoneyString(row.overdue_amount),
    next_due_date:
      typeof row.next_due_date === "string" || row.next_due_date === null
        ? row.next_due_date
        : null,
    status: toStringValue(row.status),
    allowed_actions: Array.isArray(row.allowed_actions)
      ? row.allowed_actions.filter((item): item is string => typeof item === "string")
      : [],
    disabled_reason:
      typeof row.disabled_reason === "string" || row.disabled_reason === null
        ? row.disabled_reason
        : null,
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

