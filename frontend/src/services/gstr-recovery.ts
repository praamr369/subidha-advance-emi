/**
 * Services: GSTR export, Defaulter Recovery, Guarantors, Schemes, Staff Leaderboard.
 */
import { apiFetch } from "@/lib/api";

// ── GSTR ────────────────────────────────────────────────────────────────────

export interface GstrSummary {
  total_invoices: number;
  total_taxable_value: string;
  total_cgst: string;
  total_sgst: string;
  total_igst: string;
  total_tax: string;
  grand_total: string;
  b2b_invoices: number;
  b2cs_total: string;
}
export interface GstrB2BRow {
  doc_no: string;
  doc_date: string;
  customer_name: string;
  customer_gstin: string;
  pos: string;
  taxable_value: string;
  cgst: string;
  sgst: string;
  igst: string;
  invoice_value: string;
}
export interface GstrHsnRow {
  hsn: string;
  rate: string;
  taxable_value: string;
  cgst: string;
  sgst: string;
  igst: string;
  total_tax: string;
}
export interface GstrReport {
  period: { from: string; to: string };
  summary: GstrSummary;
  b2b: GstrB2BRow[];
  b2cs: { taxable_value: string; cgst: string; sgst: string; igst: string; total: string };
  hsn_summary: GstrHsnRow[];
}

export function getGstrReport(params: { date_from?: string; date_to?: string } = {}): Promise<GstrReport> {
  const q = new URLSearchParams();
  if (params.date_from) q.set("date_from", params.date_from);
  if (params.date_to) q.set("date_to", params.date_to);
  return apiFetch<GstrReport>(`/admin/reports/gstr/?${q}`);
}

export function buildGstrCsvUrl(params: { date_from?: string; date_to?: string } = {}): string {
  const q = new URLSearchParams(params as Record<string, string>);
  q.set("export", "csv");
  return `/api/v1/admin/reports/gstr/?${q}`;
}

// ── Defaulters ───────────────────────────────────────────────────────────────

export interface DefaulterRow {
  subscription_id: number;
  contract_ref: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  plan_type: string;
  subscription_status: string;
  overdue_emis: number;
  overdue_amount: string;
  first_overdue_date: string | null;
  aging_days: number;
  aging_bucket: string;
}
export interface DefaulterListResponse {
  total: number;
  bucket_summary: Record<string, number>;
  defaulters: DefaulterRow[];
}

export function listDefaulters(params: { bucket?: string } = {}): Promise<DefaulterListResponse> {
  const q = new URLSearchParams();
  if (params.bucket) q.set("bucket", params.bucket);
  return apiFetch<DefaulterListResponse>(`/admin/defaulters/?${q}`);
}

// ── Recovery Cases ─────────────────────────────────────────────────────────

export interface RecoveryCase {
  id: number;
  subscription_id: number;
  contract_ref: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  stage: string;
  overdue_amount: string;
  overdue_emis: number;
  first_overdue_date: string | null;
  aging_days: number;
  aging_bucket: string;
  assigned_to: string | null;
  notes: string;
  notice_sent_at: string | null;
  field_visit_at: string | null;
  legal_at: string | null;
  settled_amount: string;
  settlement_type: "FULL" | "PARTIAL" | null;
  settled_at: string | null;
  last_contact_at: string | null;
}

export function listRecoveryCases(params: { stage?: string } = {}): Promise<{ count: number; results: RecoveryCase[] }> {
  const q = new URLSearchParams();
  if (params.stage) q.set("stage", params.stage);
  return apiFetch(`/admin/recovery-cases/?${q}`);
}

export function createRecoveryCase(subscription_id: number): Promise<{ created: boolean; id: number; stage: string }> {
  return apiFetch("/admin/recovery-cases/", { method: "POST", body: JSON.stringify({ subscription_id }) });
}

export function updateRecoveryCase(
  id: number,
  payload: Partial<Pick<RecoveryCase, "stage" | "notes" | "settled_amount"> & { assigned_to_id?: number }>,
): Promise<RecoveryCase> {
  return apiFetch(`/admin/recovery-cases/${id}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

// ── Guarantors ────────────────────────────────────────────────────────────

export interface Guarantor {
  id: number;
  name: string;
  phone: string;
  relation: string;
  aadhaar_no: string;
  address: string;
  is_primary: boolean;
  notes: string;
}

export function listGuarantors(subscriptionId: number): Promise<Guarantor[]> {
  return apiFetch(`/admin/subscriptions/${subscriptionId}/guarantors/`);
}

export function createGuarantor(subscriptionId: number, payload: Omit<Guarantor, "id">): Promise<Guarantor> {
  return apiFetch(`/admin/subscriptions/${subscriptionId}/guarantors/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteGuarantor(subscriptionId: number, id: number): Promise<void> {
  return apiFetch(`/admin/subscriptions/${subscriptionId}/guarantors/${id}/`, { method: "DELETE" });
}

// ── EMI Schemes ────────────────────────────────────────────────────────────

export interface EMIScheme {
  id: number;
  name: string;
  code: string;
  plan_type: string;
  discount_type: "PERCENT" | "FLAT_AMOUNT" | "WAIVE_INSTALLMENTS";
  value: string;
  valid_from: string;
  valid_to: string;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  is_currently_active: boolean;
  description: string;
  applicable_products: number[];
}

export function listSchemes(params: { active_only?: boolean } = {}): Promise<{ count: number; results: EMIScheme[] }> {
  const q = new URLSearchParams();
  if (params.active_only) q.set("active_only", "true");
  return apiFetch(`/admin/schemes/?${q}`);
}

export function createScheme(payload: Omit<EMIScheme, "id" | "used_count" | "is_currently_active">): Promise<EMIScheme> {
  return apiFetch("/admin/schemes/", { method: "POST", body: JSON.stringify(payload) });
}

export function updateScheme(id: number, payload: Partial<EMIScheme>): Promise<EMIScheme> {
  return apiFetch(`/admin/schemes/${id}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteScheme(id: number): Promise<void> {
  return apiFetch(`/admin/schemes/${id}/`, { method: "DELETE" });
}

// ── Staff Targets + Leaderboard ────────────────────────────────────────────

export interface StaffTarget {
  id: number;
  staff_id: number;
  staff_name: string;
  month: number;
  year: number;
  target_leads: number;
  target_conversions: number;
  target_revenue: string;
  notes: string;
}

export interface LeaderboardRow {
  rank: number;
  staff_id: number;
  staff_name: string;
  leads_assigned: number;
  leads_converted: number;
  target_conversions: number;
  conversion_rate: number;
  target_hit: boolean | null;
  target_revenue: string | null;
}

export function listStaffTargets(params: { year?: number; month?: number } = {}): Promise<StaffTarget[]> {
  const q = new URLSearchParams();
  if (params.year) q.set("year", String(params.year));
  if (params.month) q.set("month", String(params.month));
  return apiFetch(`/admin/crm/staff-targets/?${q}`);
}

export function setStaffTarget(payload: {
  staff_id: number;
  month: number;
  year: number;
  target_leads?: number;
  target_conversions?: number;
  target_revenue?: string;
  notes?: string;
}): Promise<{ id: number; created: boolean }> {
  return apiFetch("/admin/crm/staff-targets/", { method: "POST", body: JSON.stringify(payload) });
}

export function getLeaderboard(params: { year?: number; month?: number } = {}): Promise<{
  period: { year: number; month: number };
  leaderboard: LeaderboardRow[];
}> {
  const q = new URLSearchParams();
  if (params.year) q.set("year", String(params.year));
  if (params.month) q.set("month", String(params.month));
  return apiFetch(`/admin/crm/leaderboard/?${q}`);
}
