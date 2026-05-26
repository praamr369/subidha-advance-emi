import { apiFetch } from "@/lib/api";

export type AmendmentContractType = "EMI_SUBSCRIPTION" | "RENT_LEASE";
export type AmendmentStatus = "REQUESTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "IMPLEMENTED" | "CANCELLED" | "APPLIED";
export type AmendmentRequesterRole = "CUSTOMER" | "PARTNER";
export type AmendmentType =
  | "ADDRESS_CHANGE"
  | "CONTACT_CORRECTION"
  | "LEGAL_DOCUMENT_CORRECTION"
  | "TENURE_EXTENSION"
  | "SCHEDULE_CORRECTION"
  | "PRODUCT_CHANGE"
  | "LUCKY_ID_CHANGE"
  | "BATCH_CHANGE"
  | "DEPOSIT_ADJUSTMENT"
  | "EMI_AMOUNT_CHANGE"
  | "CONTRACT_PRICE_CHANGE"
  | "RENT_AMOUNT_CHANGE"
  | "LEASE_TERM_CHANGE"
  | "OTHER"
  | "PRODUCT_UPGRADE";

export const AMENDMENT_STATUSES: AmendmentStatus[] = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "REJECTED"];
export const AMENDMENT_TYPES: Array<{ value: AmendmentType; label: string }> = [
  { value: "ADDRESS_CHANGE", label: "Address change" },
  { value: "CONTACT_CORRECTION", label: "Contact correction" },
  { value: "LEGAL_DOCUMENT_CORRECTION", label: "Legal document correction" },
  { value: "SCHEDULE_CORRECTION", label: "Schedule correction" },
  { value: "TENURE_EXTENSION", label: "Tenure extension" },
  { value: "PRODUCT_CHANGE", label: "Product change" },
  { value: "LUCKY_ID_CHANGE", label: "Lucky ID change" },
  { value: "BATCH_CHANGE", label: "Batch change" },
  { value: "DEPOSIT_ADJUSTMENT", label: "Deposit adjustment" },
  { value: "EMI_AMOUNT_CHANGE", label: "EMI amount change" },
  { value: "CONTRACT_PRICE_CHANGE", label: "Contract price change" },
  { value: "RENT_AMOUNT_CHANGE", label: "Rent amount change" },
  { value: "LEASE_TERM_CHANGE", label: "Lease term change" },
  { value: "OTHER", label: "Other" },
];

export type AmendmentRecord = {
  id: number;
  amendment_no?: string | null;
  contract_type: AmendmentContractType;
  subscription?: number | null;
  subscription_number?: string | null;
  rent_lease_contract?: number | null;
  rent_lease_contract_number?: string | null;
  customer?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  partner?: number | null;
  requested_by?: number | null;
  requested_by_username?: string | null;
  requested_role: AmendmentRequesterRole;
  amendment_type: AmendmentType;
  status: AmendmentStatus;
  old_values?: Record<string, unknown>;
  requested_values?: Record<string, unknown>;
  approved_values?: Record<string, unknown>;
  implemented_values?: Record<string, unknown>;
  previous_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  reason: string;
  admin_note?: string;
  rejection_reason?: string | null;
  financial_impact_amount?: string | null;
  requires_emi_recalculation?: boolean;
  requires_inventory_review?: boolean;
  requires_lucky_id_review?: boolean;
  requires_accounting_review?: boolean;
  requires_rent_lease_review?: boolean;
  effective_date?: string | null;
  approved_by?: number | null;
  approved_by_username?: string | null;
  approved_at?: string | null;
  implemented_by?: number | null;
  implemented_by_username?: string | null;
  implemented_at?: string | null;
  is_implementable?: boolean;
  implementation_block_reason?: string;
  implementable_fields?: string[];
  applied_at?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string | null;
};

export type AmendmentCreatePayload = {
  contract_type: AmendmentContractType;
  subscription?: number | null;
  rent_lease_contract?: number | null;
  amendment_type: AmendmentType;
  requested_values?: Record<string, unknown>;
  reason: string;
  effective_date?: string | null;
  metadata?: Record<string, unknown>;
};

function normalizeList(payload: unknown): AmendmentRecord[] {
  if (Array.isArray(payload)) return payload as AmendmentRecord[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: AmendmentRecord[] }).results;
  }
  return [];
}

function queryString(params: Record<string, string | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listCustomerAmendments(): Promise<AmendmentRecord[]> {
  return normalizeList(await apiFetch<unknown>("/customer/contract-amendments/"));
}

export async function createCustomerAmendment(payload: AmendmentCreatePayload): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>("/customer/contract-amendments/", { method: "POST", body: payload });
}

export async function getCustomerAmendment(id: number): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/customer/contract-amendments/${id}/`);
}

export async function listPartnerAmendments(): Promise<AmendmentRecord[]> {
  return normalizeList(await apiFetch<unknown>("/partner/contract-amendments/"));
}

export async function createPartnerAmendment(payload: AmendmentCreatePayload): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>("/partner/contract-amendments/", { method: "POST", body: payload });
}

export async function getPartnerAmendment(id: number): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/partner/contract-amendments/${id}/`);
}

export async function listAdminAmendments(filters: { status?: string; contractType?: string } = {}): Promise<AmendmentRecord[]> {
  const query = queryString({ status: filters.status, contract_type: filters.contractType });
  return normalizeList(await apiFetch<unknown>(`/admin/contract-amendments/${query}`));
}

export async function getAdminAmendment(id: number): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/admin/contract-amendments/${id}/`);
}

export async function reviewAdminAmendment(id: number, adminNote = ""): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/admin/contract-amendments/${id}/review/`, { method: "POST", body: { admin_note: adminNote } });
}

export async function approveAdminAmendment(id: number, payload: { approved_values?: Record<string, unknown>; admin_note?: string } = {}): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/admin/contract-amendments/${id}/approve/`, { method: "POST", body: payload });
}

export async function rejectAdminAmendment(id: number, payload: { rejection_reason: string; admin_note?: string }): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/admin/contract-amendments/${id}/reject/`, { method: "POST", body: payload });
}

export async function implementAdminContractAmendment(id: number): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/admin/contract-amendments/${id}/implement/`, { method: "POST", body: {} });
}

export function amendmentTypeLabel(value?: string | null): string {
  return AMENDMENT_TYPES.find((row) => row.value === value)?.label ?? value ?? "—";
}

export function amendmentContractTypeLabel(value?: string | null): string {
  if (value === "EMI_SUBSCRIPTION") return "EMI Subscription";
  if (value === "RENT_LEASE") return "Rent / Lease";
  return value ?? "—";
}
