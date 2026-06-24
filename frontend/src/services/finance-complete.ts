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

// ─── LeaseContract CRUD ───

export interface LeaseContractRecord {
  id: number;
  subscription_id: number;
  asset_description: string;
  lease_type: string;
  lease_start_date: string;
  lease_end_date: string;
  lease_term_months: number;
  monthly_lease_payment: string;
  discount_rate: string;
  rou_asset_amount: string;
  initial_lease_liability: string;
  status: string;
}

export function listLeaseContracts(): Promise<{ count: number; results: LeaseContractRecord[] }> {
  return apiFetch("/admin/accounting/leases/");
}

export function createLeaseContract(payload: {
  subscription_id: number;
  asset_description: string;
  lease_type: string;
  lease_start_date: string;
  lease_end_date: string;
  monthly_lease_payment: string;
  discount_rate: string;
}): Promise<{ id: number; rou_asset_amount: string; initial_lease_liability: string; lease_term_months: number; message: string }> {
  return apiFetch("/admin/accounting/leases/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── FixedAsset CRUD ───

export interface FixedAssetRecord {
  id: number;
  asset_code: string;
  asset_name: string;
  asset_type: string;
  acquisition_date: string;
  acquisition_cost: string;
  useful_life_years: number;
  depreciation_method: string;
  salvage_value: string;
  net_book_value: string;
  accumulated_depreciation: string;
  status: string;
}

export function listFixedAssets(): Promise<{ count: number; results: FixedAssetRecord[] }> {
  return apiFetch("/admin/accounting/assets/");
}

export function createFixedAsset(payload: {
  asset_code: string;
  asset_name: string;
  asset_type: string;
  acquisition_date: string;
  acquisition_cost: string;
  useful_life_years: number;
  salvage_value?: string;
  depreciation_method?: string;
  asset_account_id?: number;
  accumulated_depreciation_account_id?: number;
  depreciation_expense_account_id?: number;
}): Promise<{ id: number; asset_code: string; net_book_value: string; message: string }> {
  return apiFetch("/admin/accounting/assets/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Cost Centres ───

export interface CostCentreRecord {
  id: number;
  code: string;
  name: string;
  centre_type: string;
  branch_id: number | null;
}

export function listCostCentres(): Promise<{ count: number; results: CostCentreRecord[] }> {
  return apiFetch("/admin/accounting/cost-centres/");
}
