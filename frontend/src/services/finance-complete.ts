import { apiFetch } from "@/lib/api";

// ─── Lease Accounting ───

export interface LeaseROUCalculation {
  subscription_id: number;
  lease_start_date: string;
  lease_end_date: string;
  lease_term_months: number;
  monthly_payment: string;
  discount_rate: string;
  rou_asset: string;
  initial_lease_liability: string;
  message: string;
}

export interface LeaseScheduleGeneration {
  lease_id: number;
  schedule_lines: number;
  message: string;
}

export interface LeaseGLPosting {
  lease_id: number;
  posted_count: number;
  message: string;
}

export function leaseCalculateROU(subscriptionId: number): Promise<LeaseROUCalculation> {
  return apiFetch(`/admin/accounting/subscriptions/${subscriptionId}/lease/calculate-rou/`);
}

export function leaseGenerateSchedule(leaseId: number, startPosting: boolean = false): Promise<LeaseScheduleGeneration> {
  return apiFetch(`/admin/accounting/leases/${leaseId}/generate-schedule/`, {
    method: "POST",
    body: JSON.stringify({ start_posting: startPosting }),
  });
}

export function leasePostToGL(leaseId: number): Promise<LeaseGLPosting> {
  return apiFetch(`/admin/accounting/leases/${leaseId}/post-to-gl/`, { method: "POST" });
}

// ─── Asset Depreciation ───

export interface DepreciationScheduleGeneration {
  asset_id: number;
  message: string;
}

export function depreciationGenerateSchedule(
  assetId: number,
  startDate: string,
  endDate: string
): Promise<DepreciationScheduleGeneration> {
  return apiFetch(`/admin/accounting/assets/${assetId}/generate-depreciation/`, {
    method: "POST",
    body: JSON.stringify({ start_date: startDate, end_date: endDate }),
  });
}

// ─── Cost Centre P&L ───

export interface CostCentrePL {
  period: { start: string; end: string };
  cost_centres: Array<{
    centre_id: number;
    centre_name: string;
    revenue: string;
    expenses: string;
    gross_profit: string;
    allocation_percentage: number;
  }>;
  message: string;
}

export function getCostCentrePL(
  costCentreId?: number,
  periodStart?: string,
  periodEnd?: string
): Promise<CostCentrePL> {
  const q = new URLSearchParams();
  if (costCentreId) q.set("cost_centre_id", String(costCentreId));
  if (periodStart) q.set("period_start", periodStart);
  if (periodEnd) q.set("period_end", periodEnd);
  return apiFetch(`/admin/accounting/reports/cost-centre-pl/?${q}`);
}

// ─── Cash Flow ───

export interface CashFlowStatement {
  period: { start: string; end: string };
  operating_activities: { receipts_from_customers: string; payments_to_vendors: string; net_operating_cf: string };
  investing_activities: { capital_purchases: string; net_investing_cf: string };
  financing_activities: { loan_repayment: string; net_financing_cf: string };
  net_cash_flow: string;
  opening_cash: string;
  closing_cash: string;
}

export function getCashFlowStatement(periodStart: string, periodEnd: string): Promise<CashFlowStatement> {
  return apiFetch(`/admin/accounting/reports/cash-flow/?period_start=${periodStart}&period_end=${periodEnd}`);
}

// ─── Fund Flow ───

export interface FundFlowStatement {
  period: { start: string; end: string };
  sources_of_funds: Record<string, string>;
  uses_of_funds: Record<string, string>;
  net_fund_increase: string;
}

export function getFundFlowStatement(periodStart: string, periodEnd: string): Promise<FundFlowStatement> {
  return apiFetch(`/admin/accounting/reports/fund-flow/?period_start=${periodStart}&period_end=${periodEnd}`);
}

// ─── Financial Ratios ───

export interface FinancialRatios {
  profitability_ratios: Record<string, number>;
  liquidity_ratios: Record<string, number>;
  efficiency_ratios: Record<string, number>;
  leverage_ratios: Record<string, number>;
  alerts: Array<{ level: string; message: string }>;
}

export function getFinancialRatios(): Promise<FinancialRatios> {
  return apiFetch("/admin/accounting/reports/financial-ratios/");
}

// ─── Deferred Tax ───

export interface DeferredTaxRecord {
  code: string;
  description: string;
  tax_type: string;
  dta_dtl_amount: string;
  expected_reversal_year?: number;
}

export interface DeferredTaxList {
  count: number;
  dta_total: string;
  dtl_total: string;
  results: DeferredTaxRecord[];
}

export function listDeferredTax(): Promise<DeferredTaxList> {
  return apiFetch("/admin/accounting/deferred-tax/");
}

export function createDeferredTax(payload: {
  code: string;
  description: string;
  tax_type: string;
  originating_date: string;
  book_amount: string;
  tax_amount: string;
  tax_rate: string;
}): Promise<{ id: number; code: string; message: string }> {
  return apiFetch("/admin/accounting/deferred-tax/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
