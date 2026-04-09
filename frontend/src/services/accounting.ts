import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/tokens";
import { API_BASE_URL } from "@/lib/constants";

export type AccountingPaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type ChartOfAccount = {
  id: number;
  code: string;
  name: string;
  account_type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  parent?: number | null;
  parent_code?: string | null;
  is_active: boolean;
  allow_manual_posting: boolean;
  system_code?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type FinanceAccount = {
  id: number;
  name: string;
  kind: "CASH" | "BANK" | "UPI";
  chart_account: number;
  chart_account_code?: string;
  chart_account_name?: string;
  opening_balance: string;
  is_active: boolean;
  bank_last4?: string;
  upi_handle?: string;
  created_at?: string;
  updated_at?: string;
};

export type JournalEntryLine = {
  id?: number;
  chart_account: number;
  chart_account_code?: string;
  chart_account_name?: string;
  description?: string;
  debit_amount: string;
  credit_amount: string;
};

export type JournalEntry = {
  id: number;
  entry_no: string;
  entry_date: string;
  entry_type: "MANUAL" | "EXPENSE" | "SALARY" | "MONEY_MOVEMENT" | "SYSTEM_BRIDGE";
  status: "DRAFT" | "POSTED" | "VOID";
  memo?: string;
  voucher_type?: string | null;
  source_type?: string | null;
  source_reference?: string | null;
  source_model?: string | null;
  source_id?: string | null;
  approved_by?: number | null;
  approved_by_username?: string | null;
  approved_at?: string | null;
  posted_by?: number | null;
  posted_by_username?: string | null;
  posted_at?: string | null;
  void_reason?: string;
  lines: JournalEntryLine[];
  created_at?: string;
  updated_at?: string;
};

export type Vendor = {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string | null;
  state_code?: string | null;
  state_name?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ExpenseVoucher = {
  id: number;
  voucher_no: string;
  expense_date: string;
  vendor?: number | null;
  vendor_name?: string | null;
  expense_account: number;
  expense_account_code?: string;
  expense_account_name?: string;
  gross_amount: string;
  tax_amount?: string | null;
  net_amount: string;
  payment_mode: "CASH" | "UPI" | "BANK";
  finance_account?: number | null;
  finance_account_name?: string | null;
  status: "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";
  bill_no?: string;
  bill_date?: string | null;
  notes?: string;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EmployeeProfile = {
  id: number;
  employee_code: string;
  name: string;
  joining_date: string;
  base_salary?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SalarySheet = {
  id: number;
  employee: number;
  employee_name?: string;
  employee_code?: string;
  year: number;
  month: number;
  gross_amount: string;
  deductions_amount: string;
  net_amount: string;
  status: "DRAFT" | "APPROVED" | "POSTED" | "PAID_PARTIAL" | "PAID";
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  payment_total?: string;
  created_at?: string;
  updated_at?: string;
};

export type MoneyMovement = {
  id: number;
  movement_no: string;
  movement_date: string;
  from_finance_account: number;
  from_finance_account_name?: string;
  to_finance_account: number;
  to_finance_account_name?: string;
  amount: string;
  reference_no?: string | null;
  notes?: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AccountingActionResponse<T> = {
  updated: boolean;
} & T;

export type TrialBalanceRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  account_type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  debit_total: string;
  credit_total: string;
  balance: string;
  balance_side: "DR" | "CR";
};

export type TrialBalanceReport = {
  start_date: string | null;
  end_date: string | null;
  rows: TrialBalanceRow[];
  total_debits: string;
  total_credits: string;
  balanced: boolean;
};

export type ProfitLossRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  amount: string;
};

export type ProfitLossReport = {
  start_date: string | null;
  end_date: string | null;
  income: ProfitLossRow[];
  expenses: ProfitLossRow[];
  income_total: string;
  expense_total: string;
  net_profit: string;
};

export type BalanceSheetRow = {
  account_id: number | null;
  account_code: string;
  account_name: string;
  balance: string;
};

export type BalanceSheetReport = {
  as_of: string;
  assets: BalanceSheetRow[];
  liabilities: BalanceSheetRow[];
  equity: BalanceSheetRow[];
  total_assets: string;
  total_liabilities: string;
  total_equity: string;
  balanced: boolean;
};

export type GeneralLedgerRow = {
  journal_entry_id: number;
  entry_no: string;
  entry_date: string;
  entry_type: string;
  voucher_type?: string | null;
  source_type?: string | null;
  source_reference?: string | null;
  memo?: string | null;
  source_model?: string | null;
  source_id?: string | null;
  description?: string | null;
  debit_amount: string;
  credit_amount: string;
  running_balance: string;
};

export type GeneralLedgerReport = {
  account: {
    id: number;
    code: string;
    name: string;
    account_type: string;
  };
  start_date: string | null;
  end_date: string | null;
  rows: GeneralLedgerRow[];
  closing_balance: string;
};

export type CashbookReport = {
  finance_account: {
    id: number;
    name: string;
    kind: string;
    chart_account_id: number;
    chart_account_code: string;
  };
} & GeneralLedgerReport;

export type TaxInvoiceLine = {
  id?: number;
  description: string;
  hsn_sac?: string;
  quantity?: string | null;
  taxable_value: string;
  gst_rate?: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  line_total: string;
};

export type TaxInvoice = {
  id: number;
  invoice_no?: string | null;
  invoice_date: string;
  doc_series?: number | null;
  doc_series_code?: string | null;
  doc_series_financial_year?: string | null;
  supplier_name: string;
  supplier_gstin?: string;
  supplier_address?: string;
  supplier_state_code?: string;
  recipient_name: string;
  recipient_address?: string;
  recipient_gstin?: string;
  place_of_supply_state_code?: string;
  supply_kind: "INTRA" | "INTER";
  subtotal_taxable: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  total_amount: string;
  status: "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";
  notes?: string;
  approved_by?: number | null;
  approved_by_username?: string | null;
  approved_at?: string | null;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  lines: TaxInvoiceLine[];
  created_at?: string;
  updated_at?: string;
};

export type GstNote = {
  id: number;
  note_no?: string | null;
  note_date: string;
  doc_series?: number | null;
  doc_series_code?: string | null;
  doc_series_financial_year?: string | null;
  original_invoice: number;
  original_invoice_no?: string | null;
  reason?: string;
  taxable_adjustment: string;
  tax_adjustment: string;
  total_adjustment: string;
  status: "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";
  approved_by?: number | null;
  approved_by_username?: string | null;
  approved_at?: string | null;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ExportPackJob = {
  id: number;
  pack_type: "ITR_HANDOFF" | "GST_HANDOFF";
  financial_year: string;
  start_date?: string | null;
  end_date?: string | null;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  file_path?: string;
  created_by?: number | null;
  created_by_username?: string | null;
  error_message?: string;
  created_at?: string;
  updated_at?: string;
};

export type AccountingPeriod = {
  id: number;
  code: string;
  label: string;
  start_date: string;
  end_date: string;
  is_locked: boolean;
  locked_at?: string | null;
  locked_by?: number | null;
  locked_by_username?: string | null;
  lock_reason?: string;
  created_at?: string;
  updated_at?: string;
};

export type PostingLock = {
  id: number;
  lock_date: string;
  reason?: string;
  locked_by?: number | null;
  locked_by_username?: string | null;
  locked_at?: string | null;
};

export type AssetCategory = {
  id: number;
  code: string;
  name: string;
  method: "SLM" | "WDM";
  useful_life_months: number;
  rate_annual?: string | null;
  default_salvage: string;
  is_active: boolean;
};

export type Asset = {
  id: number;
  asset_code: string;
  category: number;
  category_code?: string;
  category_name?: string;
  description: string;
  acquisition_date: string;
  in_service_date: string;
  cost_amount: string;
  salvage_value: string;
  accumulated_depreciation: string;
  status: "ACTIVE" | "DISPOSED";
  vendor?: number | null;
  vendor_name?: string | null;
  purchase_bill?: number | null;
  purchase_bill_no?: string | null;
};

export type DepreciationLine = {
  id: number;
  asset: number;
  asset_code?: string;
  asset_description?: string;
  depreciation_amount: string;
  journal_entry?: number | null;
  journal_entry_no?: string | null;
};

export type DepreciationRun = {
  id: number;
  run_code: string;
  period_start: string;
  period_end: string;
  status: "DRAFT" | "RUNNING" | "POSTED" | "CANCELLED";
  created_by?: number | null;
  created_by_username?: string | null;
  executed_at?: string | null;
  posted_at?: string | null;
  lines: DepreciationLine[];
};

export type AccountingPurchaseBill = {
  id: number;
  bill_no: string;
  bill_date: string;
  vendor: number;
  vendor_name?: string;
  tax_mode: string;
  status: "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";
  subtotal: string;
  tax_total: string;
  grand_total: string;
  finance_account?: number | null;
  finance_account_name?: string | null;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  notes?: string;
};

export type VendorSettlement = {
  id: number;
  settlement_no: string;
  vendor: number;
  vendor_name?: string;
  settlement_date: string;
  amount: string;
  finance_account: number;
  finance_account_name?: string;
  reference_no?: string | null;
  purchase_bill?: number | null;
  purchase_bill_no?: string | null;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
};

export type AccountingBridgePosting = {
  id: number;
  source_model: string;
  source_id: string;
  purpose: string;
  voucher_type?: string | null;
  source_type?: string | null;
  source_reference?: string | null;
  source_document_no?: string | null;
  source_event_date?: string | null;
  trace_metadata?: Record<string, unknown>;
  journal_entry: number;
  journal_entry_no?: string | null;
  journal_entry_status?: string | null;
  journal_entry_date?: string | null;
  journal_entry_memo?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type FinanceBookRow = {
  finance_account_id: number;
  finance_account_name: string;
  kind: string;
  journal_entry_id: number;
  entry_no: string;
  entry_date: string;
  voucher_type?: string | null;
  source_type?: string | null;
  source_reference?: string | null;
  memo?: string | null;
  source_model?: string | null;
  source_id?: string | null;
  description?: string | null;
  debit_amount: string;
  credit_amount: string;
};

export type FinanceBookReport = {
  start_date: string | null;
  end_date: string | null;
  finance_account_kinds: string[];
  rows: FinanceBookRow[];
};

export type SalesBookRow = {
  invoice_id: number;
  document_no?: string | null;
  invoice_date: string;
  customer_name?: string | null;
  billing_channel: string;
  tax_mode: string;
  grand_total: string;
  tax_total: string;
  journal_entry_id: number;
  journal_entry_no: string;
};

export type PurchaseBookRow = {
  purchase_bill_id: number;
  bill_no: string;
  bill_date: string;
  vendor_name: string;
  tax_mode: string;
  grand_total: string;
  tax_total: string;
  journal_entry_id: number;
  journal_entry_no: string;
};

export type SimpleBookReport<T> = {
  start_date: string | null;
  end_date: string | null;
  rows: T[];
};

export type BridgeRunResponse = {
  start_date: string;
  end_date: string;
  purposes: string[];
  dry_run: boolean;
  results: Array<{
    purpose: string;
    candidates: number;
    created_count: number;
    existing_count: number;
    dry_run: boolean;
  }>;
};

export type Phase3BridgeRunResponse = {
  start_date: string;
  end_date: string;
  dry_run: boolean;
  purpose: string;
  candidates?: number;
  created_count?: number;
  existing_count?: number;
  purchase_candidates?: number;
  purchase_created?: number;
  purchase_existing?: number;
  adjustment_candidates?: number;
  adjustment_created?: number;
  adjustment_existing?: number;
  settlement_created_count?: number;
  settlement_existing_count?: number;
  skipped?: Array<Record<string, unknown>>;
};

function buildQuery(
  params: Record<string, string | number | undefined | null>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listChartOfAccounts(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<ChartOfAccount>>(
    `/accounting/chart-of-accounts/${buildQuery(params)}`
  );
}

export function createChartOfAccount(payload: Partial<ChartOfAccount>) {
  return apiFetch<ChartOfAccount>("/accounting/chart-of-accounts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listFinanceAccounts(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<FinanceAccount>>(
    `/accounting/finance-accounts/${buildQuery(params)}`
  );
}

export function createFinanceAccount(payload: Partial<FinanceAccount>) {
  return apiFetch<FinanceAccount>("/accounting/finance-accounts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listJournalEntries(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<JournalEntry>>(
    `/accounting/journal-entries/${buildQuery(params)}`
  );
}

export function createManualJournalEntry(payload: {
  entry_date: string;
  entry_type: "MANUAL";
  memo?: string;
  lines: JournalEntryLine[];
}) {
  return apiFetch<JournalEntry>("/accounting/journal-entries/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function postJournalEntry(id: number) {
  return apiFetch<AccountingActionResponse<{ journal_entry: JournalEntry }>>(
    `/accounting/journal-entries/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function voidJournalEntry(id: number, reason: string) {
  return apiFetch<AccountingActionResponse<{ journal_entry: JournalEntry }>>(
    `/accounting/journal-entries/${id}/void/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function listVendors(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<Vendor>>(
    `/accounting/vendors/${buildQuery(params)}`
  );
}

export function createVendor(payload: Partial<Vendor>) {
  return apiFetch<Vendor>("/accounting/vendors/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listExpenses(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<ExpenseVoucher>>(
    `/accounting/expenses/${buildQuery(params)}`
  );
}

export function createExpenseVoucher(payload: Partial<ExpenseVoucher>) {
  return apiFetch<ExpenseVoucher>("/accounting/expenses/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function approveExpenseVoucher(id: number) {
  return apiFetch<AccountingActionResponse<{ expense: ExpenseVoucher }>>(
    `/accounting/expenses/${id}/approve/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function postExpenseVoucher(id: number) {
  return apiFetch<AccountingActionResponse<{ expense: ExpenseVoucher }>>(
    `/accounting/expenses/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function listEmployees(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<EmployeeProfile>>(
    `/accounting/employees/${buildQuery(params)}`
  );
}

export function createEmployeeProfile(payload: Partial<EmployeeProfile>) {
  return apiFetch<EmployeeProfile>("/accounting/employees/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listSalarySheets(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<SalarySheet>>(
    `/accounting/salary-sheets/${buildQuery(params)}`
  );
}

export function createSalarySheet(payload: Partial<SalarySheet>) {
  return apiFetch<SalarySheet>("/accounting/salary-sheets/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function approveSalarySheet(id: number) {
  return apiFetch<AccountingActionResponse<{ salary_sheet: SalarySheet }>>(
    `/accounting/salary-sheets/${id}/approve/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function postSalarySheet(id: number) {
  return apiFetch<AccountingActionResponse<{ salary_sheet: SalarySheet }>>(
    `/accounting/salary-sheets/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function listMoneyMovements(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<MoneyMovement>>(
    `/accounting/money-movements/${buildQuery(params)}`
  );
}

export function createMoneyMovement(payload: Partial<MoneyMovement>) {
  return apiFetch<MoneyMovement>("/accounting/money-movements/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function postMoneyMovement(id: number) {
  return apiFetch<AccountingActionResponse<{ money_movement: MoneyMovement }>>(
    `/accounting/money-movements/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function getTrialBalance(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<TrialBalanceReport>(
    `/accounting/reports/trial-balance/${buildQuery(params)}`
  );
}

export function getProfitLoss(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<ProfitLossReport>(
    `/accounting/reports/profit-loss/${buildQuery(params)}`
  );
}

export function getBalanceSheet(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<BalanceSheetReport>(
    `/accounting/reports/balance-sheet/${buildQuery(params)}`
  );
}

export function getGeneralLedger(params: Record<string, string | number | undefined | null>) {
  return apiFetch<GeneralLedgerReport>(
    `/accounting/reports/general-ledger/${buildQuery(params)}`
  );
}

export function getCashbook(params: Record<string, string | number | undefined | null>) {
  return apiFetch<CashbookReport>(
    `/accounting/reports/cashbook/${buildQuery(params)}`
  );
}

export function listTaxInvoices(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<TaxInvoice>>(
    `/accounting/tax-invoices/${buildQuery(params)}`
  );
}

export function createTaxInvoice(payload: Partial<TaxInvoice>) {
  return apiFetch<TaxInvoice>("/accounting/tax-invoices/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function approveTaxInvoice(id: number) {
  return apiFetch<AccountingActionResponse<{ tax_invoice: TaxInvoice }>>(
    `/accounting/tax-invoices/${id}/approve/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function postTaxInvoice(id: number) {
  return apiFetch<AccountingActionResponse<{ tax_invoice: TaxInvoice }>>(
    `/accounting/tax-invoices/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function cancelTaxInvoice(id: number, reason: string) {
  return apiFetch<AccountingActionResponse<{ tax_invoice: TaxInvoice }>>(
    `/accounting/tax-invoices/${id}/cancel/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function listCreditNotes(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<GstNote>>(
    `/accounting/credit-notes/${buildQuery(params)}`
  );
}

export function createCreditNote(payload: Partial<GstNote>) {
  return apiFetch<GstNote>("/accounting/credit-notes/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function approveCreditNote(id: number) {
  return apiFetch<AccountingActionResponse<{ credit_note: GstNote }>>(
    `/accounting/credit-notes/${id}/approve/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function postCreditNote(id: number) {
  return apiFetch<AccountingActionResponse<{ credit_note: GstNote }>>(
    `/accounting/credit-notes/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function cancelCreditNote(id: number, reason: string) {
  return apiFetch<AccountingActionResponse<{ credit_note: GstNote }>>(
    `/accounting/credit-notes/${id}/cancel/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function listDebitNotes(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<GstNote>>(
    `/accounting/debit-notes/${buildQuery(params)}`
  );
}

export function createDebitNote(payload: Partial<GstNote>) {
  return apiFetch<GstNote>("/accounting/debit-notes/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function approveDebitNote(id: number) {
  return apiFetch<AccountingActionResponse<{ debit_note: GstNote }>>(
    `/accounting/debit-notes/${id}/approve/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function postDebitNote(id: number) {
  return apiFetch<AccountingActionResponse<{ debit_note: GstNote }>>(
    `/accounting/debit-notes/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function cancelDebitNote(id: number, reason: string) {
  return apiFetch<AccountingActionResponse<{ debit_note: GstNote }>>(
    `/accounting/debit-notes/${id}/cancel/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function listItrExportPacks() {
  return apiFetch<ExportPackJob[]>("/accounting/exports/itr-pack/");
}

export function listGstExportPacks() {
  return apiFetch<ExportPackJob[]>("/accounting/exports/gst-pack/");
}

export function createItrExportPack(payload: {
  financial_year?: string;
  start_date?: string;
  end_date?: string;
}) {
  return apiFetch<ExportPackJob>("/accounting/exports/itr-pack/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createGstExportPack(payload: {
  financial_year?: string;
  start_date?: string;
  end_date?: string;
}) {
  return apiFetch<ExportPackJob>("/accounting/exports/gst-pack/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getItrExportPack(id: number) {
  return apiFetch<ExportPackJob>(`/accounting/exports/itr-pack/${id}/`);
}

export async function downloadItrExportPack(id: number): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/accounting/exports/itr-pack/${id}/download/`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error("Failed to download ITR export pack.");
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `itr-pack-${id}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export function runAccountingBridge(payload: {
  start_date: string;
  end_date: string;
  purposes?: string[];
  dry_run?: boolean;
}) {
  return apiFetch<BridgeRunResponse>("/accounting/bridges/run/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listAccountingPeriods(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<AccountingPeriod>>(
    `/accounting/periods/${buildQuery(params)}`
  );
}

export function createAccountingPeriod(payload: Partial<AccountingPeriod>) {
  return apiFetch<AccountingPeriod>("/accounting/periods/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function lockAccountingPeriod(id: number, reason = "") {
  return apiFetch<AccountingActionResponse<{ period: AccountingPeriod }>>(
    `/accounting/periods/${id}/lock/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function unlockAccountingPeriod(id: number, reason = "") {
  return apiFetch<AccountingActionResponse<{ period: AccountingPeriod }>>(
    `/accounting/periods/${id}/unlock/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function closeAccountingPeriod(id: number, reason = "") {
  return apiFetch<AccountingActionResponse<{ period: AccountingPeriod }>>(
    `/accounting/periods/${id}/close/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function reopenAccountingPeriod(id: number, reason = "") {
  return apiFetch<AccountingActionResponse<{ period: AccountingPeriod }>>(
    `/accounting/periods/${id}/reopen/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function listPostingLocks(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<PostingLock>>(
    `/accounting/locks/${buildQuery(params)}`
  );
}

export function listAccountingBridgePostings(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<AccountingBridgePosting>>(
    `/accounting/bridge-postings/${buildQuery(params)}`
  );
}

export function createPostingLock(payload: { lock_date: string; reason?: string }) {
  return apiFetch<PostingLock>("/accounting/locks/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removePostingLock(id: number) {
  return apiFetch<PostingLock>(`/accounting/locks/${id}/`, {
    method: "DELETE",
  });
}

export function listAssetCategories(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<AssetCategory>>(
    `/accounting/assets/categories/${buildQuery(params)}`
  );
}

export function createAssetCategory(payload: Partial<AssetCategory>) {
  return apiFetch<AssetCategory>("/accounting/assets/categories/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listAssets(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<Asset>>(
    `/accounting/assets/${buildQuery(params)}`
  );
}

export function createAsset(payload: Partial<Asset>) {
  return apiFetch<Asset>("/accounting/assets/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listDepreciationRuns(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<DepreciationRun>>(
    `/accounting/depreciation/runs/${buildQuery(params)}`
  );
}

export function createDepreciationRun(payload: Partial<DepreciationRun>) {
  return apiFetch<DepreciationRun>("/accounting/depreciation/runs/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runDepreciation(id: number) {
  return apiFetch<AccountingActionResponse<{ depreciation_run: DepreciationRun }>>(
    `/accounting/depreciation/runs/${id}/run/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function postDepreciation(id: number) {
  return apiFetch<AccountingActionResponse<{ depreciation_run: DepreciationRun }>>(
    `/accounting/depreciation/runs/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function cancelDepreciation(id: number, reason = "") {
  return apiFetch<AccountingActionResponse<{ depreciation_run: DepreciationRun }>>(
    `/accounting/depreciation/runs/${id}/cancel/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function listPurchaseBills(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<AccountingPurchaseBill>>(
    `/accounting/purchase-bills/${buildQuery(params)}`
  );
}

export function approvePurchaseBill(id: number) {
  return apiFetch<AccountingActionResponse<{ purchase_bill: AccountingPurchaseBill }>>(
    `/accounting/purchase-bills/${id}/approve/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function postPurchaseBill(id: number) {
  return apiFetch<AccountingActionResponse<{ purchase_bill: AccountingPurchaseBill }>>(
    `/accounting/purchase-bills/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function cancelPurchaseBill(id: number, reason = "") {
  return apiFetch<AccountingActionResponse<{ purchase_bill: AccountingPurchaseBill }>>(
    `/accounting/purchase-bills/${id}/cancel/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function listVendorSettlements(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<VendorSettlement>>(
    `/accounting/vendor-settlements/${buildQuery(params)}`
  );
}

export function createVendorSettlement(payload: Partial<VendorSettlement>) {
  return apiFetch<VendorSettlement>("/accounting/vendor-settlements/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function postVendorSettlement(id: number) {
  return apiFetch<AccountingActionResponse<{ vendor_settlement: VendorSettlement }>>(
    `/accounting/vendor-settlements/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function cancelVendorSettlement(id: number, reason = "") {
  return apiFetch<AccountingActionResponse<{ vendor_settlement: VendorSettlement }>>(
    `/accounting/vendor-settlements/${id}/cancel/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function getCashBook(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<FinanceBookReport>(`/accounting/books/cash/${buildQuery(params)}`);
}

export function getBankBook(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<FinanceBookReport>(`/accounting/books/bank/${buildQuery(params)}`);
}

export function getUpiBook(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<FinanceBookReport>(`/accounting/books/upi/${buildQuery(params)}`);
}

export function getSalesBook(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<SimpleBookReport<SalesBookRow>>(`/accounting/books/sales/${buildQuery(params)}`);
}

export function getPurchaseBook(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<SimpleBookReport<PurchaseBookRow>>(`/accounting/books/purchase/${buildQuery(params)}`);
}

export function runRetailSaleBridge(payload: {
  start_date: string;
  end_date: string;
  dry_run?: boolean;
}) {
  return apiFetch<Phase3BridgeRunResponse>("/accounting/bridges/run-retail-sale/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runInventoryPostingBridge(payload: {
  start_date: string;
  end_date: string;
  dry_run?: boolean;
}) {
  return apiFetch<Phase3BridgeRunResponse>("/accounting/bridges/run-inventory-posting/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runEmiSubscriptionBridge(payload: {
  start_date: string;
  end_date: string;
  dry_run?: boolean;
}) {
  return apiFetch<Phase3BridgeRunResponse>("/accounting/bridges/run-emi-subscription/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runEmiPaymentBridge(payload: {
  start_date: string;
  end_date: string;
  dry_run?: boolean;
}) {
  return apiFetch<Phase3BridgeRunResponse>("/accounting/bridges/run-emi-payment/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runEmiWaiverBridge(payload: {
  start_date: string;
  end_date: string;
  dry_run?: boolean;
}) {
  return apiFetch<Phase3BridgeRunResponse>("/accounting/bridges/run-emi-waiver/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runCommissionSettlementBridge(payload: {
  start_date: string;
  end_date: string;
  dry_run?: boolean;
}) {
  return apiFetch<Phase3BridgeRunResponse>("/accounting/bridges/run-commission-settlement/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runPayoutBatchBridge(payload: {
  start_date: string;
  end_date: string;
  dry_run?: boolean;
}) {
  return apiFetch<Phase3BridgeRunResponse>("/accounting/bridges/run-payout-batch/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
