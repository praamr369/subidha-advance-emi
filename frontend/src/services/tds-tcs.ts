import { apiFetch } from "@/lib/api";

// ── TDS ──────────────────────────────────────────────────────────────────────

export const TDS_SECTIONS = [
  { value: "194C", label: "194C – Contractor/Sub-contractor" },
  { value: "194I", label: "194I – Rent" },
  { value: "194J", label: "194J – Professional/Technical Services" },
  { value: "194H", label: "194H – Commission/Brokerage" },
  { value: "194A", label: "194A – Interest (non-bank)" },
  { value: "194Q", label: "194Q – Purchase of Goods" },
  { value: "OTHER", label: "Other" },
] as const;

export const TCS_SECTIONS = [
  { value: "206C(1H)", label: "206C(1H) – Sale of Goods (>₹50L)" },
  { value: "206C(1)", label: "206C(1) – Timber/Forest/Scrap" },
  { value: "206CCA", label: "206CCA – Non-filer higher rate" },
  { value: "OTHER", label: "Other" },
] as const;

export type TDSStatus = "PENDING" | "DEPOSITED" | "FILED";
export type TCSStatus = "PENDING" | "DEPOSITED" | "FILED";

export interface TDSDeduction {
  id: number;
  vendor_id: number;
  vendor_name: string | null;
  section: string;
  transaction_date: string;
  gross_amount: string;
  tds_rate: string;
  tds_amount: string;
  net_amount: string;
  reference_no: string;
  challan_no: string;
  deposit_date: string | null;
  status: TDSStatus;
  financial_year: string;
  quarter: string;
  notes: string;
  created_at: string;
}

export interface TDSListResponse {
  count: number;
  totals: { gross: string; tds: string };
  results: TDSDeduction[];
}

export interface TCSCollection {
  id: number;
  customer_name: string;
  customer_pan: string;
  section: string;
  transaction_date: string;
  sale_amount: string;
  tcs_rate: string;
  tcs_amount: string;
  reference_no: string;
  challan_no: string;
  deposit_date: string | null;
  status: TCSStatus;
  financial_year: string;
  quarter: string;
  notes: string;
  created_at: string;
}

export interface TCSListResponse {
  count: number;
  totals: { sale: string; tcs: string };
  results: TCSCollection[];
}

export function listTDSDeductions(params: { fy?: string; quarter?: string; status?: string } = {}): Promise<TDSListResponse> {
  const q = new URLSearchParams();
  if (params.fy) q.set("fy", params.fy);
  if (params.quarter) q.set("quarter", params.quarter);
  if (params.status) q.set("status", params.status);
  return apiFetch(`/accounting/tds-deductions/?${q}`);
}

export function createTDSDeduction(payload: {
  vendor_id: number;
  section: string;
  transaction_date: string;
  gross_amount: string;
  tds_rate: string;
  reference_no?: string;
  notes?: string;
}): Promise<TDSDeduction> {
  return apiFetch("/accounting/tds-deductions/", { method: "POST", body: JSON.stringify(payload) });
}

export function markTDSDeposited(id: number, payload: { challan_no?: string; deposit_date?: string }): Promise<TDSDeduction> {
  return apiFetch(`/accounting/tds-deductions/${id}/mark-deposited/`, { method: "POST", body: JSON.stringify(payload) });
}

export function listTCSCollections(params: { fy?: string; quarter?: string; status?: string } = {}): Promise<TCSListResponse> {
  const q = new URLSearchParams();
  if (params.fy) q.set("fy", params.fy);
  if (params.quarter) q.set("quarter", params.quarter);
  if (params.status) q.set("status", params.status);
  return apiFetch(`/accounting/tcs-collections/?${q}`);
}

export function createTCSCollection(payload: {
  customer_name: string;
  customer_pan?: string;
  section: string;
  transaction_date: string;
  sale_amount: string;
  tcs_rate: string;
  reference_no?: string;
  notes?: string;
}): Promise<TCSCollection> {
  return apiFetch("/accounting/tcs-collections/", { method: "POST", body: JSON.stringify(payload) });
}

export function markTCSDeposited(id: number, payload: { challan_no?: string; deposit_date?: string }): Promise<TCSCollection> {
  return apiFetch(`/accounting/tcs-collections/${id}/mark-deposited/`, { method: "POST", body: JSON.stringify(payload) });
}

// ── Statutory deductions on salary sheet ─────────────────────────────────

export interface StatutoryLine {
  component_name: string;
  amount: string;
  notes: string;
}

export interface StatutoryPreview {
  sheet_id: number;
  employee: string;
  gross: string;
  statutory_lines: StatutoryLine[];
}

export function previewStatutoryDeductions(sheetId: number): Promise<StatutoryPreview> {
  return apiFetch(`/accounting/salary-sheets/${sheetId}/statutory-deductions/`);
}

export function applyStatutoryDeductions(sheetId: number): Promise<{ added: string[]; total_deduction: string }> {
  return apiFetch(`/accounting/salary-sheets/${sheetId}/statutory-deductions/`, { method: "POST" });
}
