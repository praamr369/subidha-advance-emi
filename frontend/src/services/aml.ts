import { apiFetch } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AMLResult = "CLEAR" | "WATCHLIST_HIT" | "PEP_CONFIRMED" | "SANCTIONED" | "PENDING";

export const AML_RESULT_LABELS: Record<AMLResult, string> = {
  CLEAR: "Clear",
  WATCHLIST_HIT: "Watchlist Hit",
  PEP_CONFIRMED: "PEP Confirmed",
  SANCTIONED: "Sanctioned",
  PENDING: "Pending",
};

export const AML_RESULT_COLORS: Record<AMLResult, string> = {
  CLEAR: "bg-green-50 text-green-700 border-green-200",
  WATCHLIST_HIT: "bg-yellow-50 text-yellow-700 border-yellow-200",
  PEP_CONFIRMED: "bg-orange-50 text-orange-700 border-orange-200",
  SANCTIONED: "bg-red-100 text-red-800 border-red-300",
  PENDING: "bg-gray-50 text-gray-600 border-gray-200",
};

export interface AMLScreening {
  id: number;
  customer_id: number;
  customer_name: string;
  screening_date: string;
  result: AMLResult;
  screened_by: string | null;
  checked_rbi_defaulter_list: boolean;
  checked_interpol: boolean;
  checked_ofac: boolean;
  checked_un_sanctions: boolean;
  checked_pep_list: boolean;
  notes: string;
  watchlist_reference: string;
  next_review_date: string | null;
  is_latest: boolean;
  created_at: string;
}

export interface CustomerAMLProfile {
  customer_id: number;
  customer_name: string;
  is_pep: boolean;
  pep_flagged_at: string | null;
  aml_cleared: boolean;
  aml_cleared_at: string | null;
  latest_screening: AMLScreening | null;
  history: AMLScreening[];
}

export interface KYCReverificationDoc {
  document_id: number;
  customer_id: number;
  customer_name: string;
  document_type: string;
  category: string;
  expiry_date: string | null;
  days_left: number | null;
  overdue: boolean;
  status: string;
  reviewed_by: string | null;
}

// ── Screening list ────────────────────────────────────────────────────────────

export function listAMLScreenings(params: { customer_id?: number; result?: string; latest_only?: boolean } = {}): Promise<{ count: number; results: AMLScreening[] }> {
  const q = new URLSearchParams();
  if (params.customer_id) q.set("customer_id", String(params.customer_id));
  if (params.result) q.set("result", params.result);
  if (params.latest_only) q.set("latest_only", "1");
  return apiFetch(`/admin/aml/screenings/?${q}`);
}

// ── Per-customer AML ──────────────────────────────────────────────────────────

export function getCustomerAMLProfile(customerId: number): Promise<CustomerAMLProfile> {
  return apiFetch(`/admin/aml/customers/${customerId}/screenings/`);
}

export function createAMLScreening(customerId: number, payload: {
  result: AMLResult;
  screening_date?: string;
  next_review_date?: string;
  notes?: string;
  watchlist_reference?: string;
  checked_rbi_defaulter_list?: boolean;
  checked_interpol?: boolean;
  checked_ofac?: boolean;
  checked_un_sanctions?: boolean;
  checked_pep_list?: boolean;
}): Promise<AMLScreening> {
  return apiFetch(`/admin/aml/customers/${customerId}/screenings/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function togglePEPFlag(customerId: number, isPep: boolean): Promise<{ customer_id: number; is_pep: boolean }> {
  return apiFetch(`/admin/aml/customers/${customerId}/pep-flag/`, {
    method: "POST",
    body: JSON.stringify({ is_pep: isPep }),
  });
}

// ── KYC re-verification ───────────────────────────────────────────────────────

export function listKYCReverificationQueue(withinDays = 60): Promise<{ count: number; results: KYCReverificationDoc[] }> {
  return apiFetch(`/admin/kyc/reverification-queue/?within_days=${withinDays}`);
}

export function requestKYCReverification(docId: number, reason?: string): Promise<{
  document_id: number; old_status: string; new_status: string; customer_id: number; reason: string;
}> {
  return apiFetch(`/admin/kyc/documents/${docId}/request-reverification/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
