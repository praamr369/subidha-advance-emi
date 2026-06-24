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

// ── GSTR-2B ITC Reconciliation ───────────────────────────────────────────────

export interface Gstr2bRow {
  supplier_gstin: string;
  invoice_no: string;
  invoice_date: string;
  taxable_value_2b: string;
  cgst_2b: string;
  sgst_2b: string;
  igst_2b: string;
}

export interface Gstr2bMatchedRow extends Gstr2bRow {
  tax_invoice_id: number;
  supplier_name: string;
  invoice_date_books: string;
  taxable_value_books: string;
  cgst_books: string;
  sgst_books: string;
  igst_books: string;
  taxable_diff: string;
  cgst_diff: string;
  sgst_diff: string;
  igst_diff: string;
  match_status: "MATCHED" | "DISCREPANCY";
}

export interface Gstr2bNotInBooksRow extends Gstr2bRow {
  match_status: "NOT_IN_BOOKS";
  note: string;
}

export interface Gstr2bNotIn2bRow {
  tax_invoice_id: number;
  supplier_gstin: string;
  supplier_name: string;
  invoice_no: string;
  invoice_date_books: string;
  taxable_value_books: string;
  cgst_books: string;
  sgst_books: string;
  igst_books: string;
  match_status: "NOT_IN_2B";
  note: string;
}

export interface Gstr2bReconcileResult {
  summary: {
    total_in_2b: number;
    matched: number;
    discrepancies: number;
    not_in_books: number;
    not_in_2b: number;
  };
  matched: Gstr2bMatchedRow[];
  not_in_books: Gstr2bNotInBooksRow[];
  not_in_2b: Gstr2bNotIn2bRow[];
}

export function reconcileGstr2b(body: {
  b2b?: Gstr2bRow[];
  gstn_raw?: unknown;
}): Promise<Gstr2bReconcileResult> {
  return apiFetch<Gstr2bReconcileResult>("/admin/gstr/2b-reconcile/", {
    method: "POST",
    body: JSON.stringify(body),
  });
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

// ── Recovery automation ────────────────────────────────────────────────────

export function sendLegalNotice(caseId: number, email: string): Promise<{
  sent: boolean; to: string; case_id: number; new_stage: string; notice_sent_at: string;
}> {
  return apiFetch(`/admin/recovery-cases/${caseId}/send-legal-notice/`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function sendSettlementOffer(caseId: number, email: string): Promise<{ sent: boolean; to: string; case_id: number }> {
  return apiFetch(`/admin/recovery-cases/${caseId}/send-settlement-offer/`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function bulkEscalateRecoveryCases(dryRun = false): Promise<{
  dry_run: boolean; escalated_count: number; escalated: Array<{ case_id: number; customer: string; to_stage: string; aging_days: number }>;
}> {
  return apiFetch("/admin/recovery-cases/bulk-escalate/", {
    method: "POST",
    body: JSON.stringify({ dry_run: dryRun }),
  });
}
