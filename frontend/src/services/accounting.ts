import { apiFetch } from "@/lib/api";
import { downloadAuthenticatedFile } from "@/lib/export/auth-download";

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
  is_legacy?: boolean;
  legacy_reason?: string;
  superseded_by?: number | null;
  superseded_by_code?: string | null;
  superseded_by_name?: string | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
};

export type FinanceAccount = {
  id: number;
  name: string;
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  kind: "CASH" | "BANK" | "UPI";
  chart_account: number;
  chart_account_code?: string;
  chart_account_name?: string;
  mapped_chart_account_id?: number | null;
  mapped_chart_account_code?: string | null;
  mapped_chart_account_name?: string | null;
  mapped_chart_account_type?: string | null;
  mapped_chart_account_is_posting?: boolean | null;
  collection_ready?: boolean;
  collection_blocker_reason?: string | null;
  recommended_action?: string | null;
  opening_balance: string;
  is_active: boolean;
  is_real_settlement_account?: boolean;
  bank_last4?: string;
  upi_handle?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
};

export type AccountingMasterEditability = {
  can_edit: boolean;
  editable_fields: string[];
  locked_fields: Record<string, string>;
  can_deactivate: boolean;
  deactivate_reason?: string | null;
  can_change_parent?: boolean | null;
  parent_change_reason?: string | null;
  can_change_chart_account?: boolean | null;
  chart_account_change_reason?: string | null;
  usage_summary?: Record<string, boolean | string | number | null>;
};

export type ChartOfAccountDetail = ChartOfAccount & {
  parent_name?: string | null;
  child_count?: number;
  finance_account_count?: number;
  editability: AccountingMasterEditability;
};

export type FinanceAccountDetail = FinanceAccount & {
  editability: AccountingMasterEditability;
};

export type AccountingEditabilityEnvelope<T> = {
  success: boolean;
  data: T;
  editability: AccountingMasterEditability;
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
  financial_year?: number | null;
  financial_year_code?: string | null;
  financial_year_name?: string | null;
  accounting_period?: number | null;
  accounting_period_code?: string | null;
  accounting_period_name?: string | null;
  accounting_period_status?: "OPEN" | "LOCKED" | "CLOSED" | string | null;
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

export type VendorOperationalPurchaseBill = {
  id: number;
  bill_no: string;
  bill_date: string;
  status: string;
  branch_id?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  finance_account_id?: number | null;
  finance_account_name?: string | null;
  grand_total: string;
  settled_amount: string;
  outstanding_amount: string;
};

export type VendorOperationalSettlement = {
  id: number;
  settlement_no: string;
  settlement_date: string;
  status: string;
  amount: string;
  reference_no?: string | null;
  branch_id?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  finance_account_id?: number | null;
  finance_account_name?: string | null;
  purchase_bill_id?: number | null;
  purchase_bill_no?: string | null;
};

export type VendorOperationalTimelineRow = {
  kind: "PURCHASE_BILL" | "SETTLEMENT";
  date: string;
  reference_no: string;
  status: string;
  amount: string;
  outstanding_amount?: string | null;
  linked_purchase_bill_id?: number | null;
};

export type VendorOperationalSummary = {
  vendor: {
    id: number;
    name: string;
    phone?: string | null;
    email?: string | null;
    is_active: boolean;
    gstin?: string | null;
  };
  summary: {
    purchase_bill_count: number;
    posted_purchase_bill_count: number;
    settlement_count: number;
    posted_settlement_count: number;
    posted_purchase_total: string;
    posted_settlement_total: string;
    outstanding_payable_total: string;
  };
  purchase_bills: {
    summary: {
      total_count: number;
      draft_count: number;
      approved_count: number;
      posted_count: number;
      cancelled_count: number;
      gross_total: string;
      posted_total: string;
    };
    rows: VendorOperationalPurchaseBill[];
  };
  settlements: {
    summary: {
      total_count: number;
      draft_count: number;
      posted_count: number;
      cancelled_count: number;
      gross_total: string;
      posted_total: string;
    };
    rows: VendorOperationalSettlement[];
  };
  timeline: VendorOperationalTimelineRow[];
};

export type ExpenseVoucher = {
  id: number;
  voucher_no: string;
  expense_date: string;
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
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
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  phone?: string;
  designation?: string;
  department?: string;
  joining_date: string;
  base_salary?: string | null;
  standard_daily_hours?: string;
  overtime_rate_per_hour?: string | null;
  is_active: boolean;
  notes?: string;
  compensation_components?: EmployeeCompensationComponent[];
  created_at?: string;
  updated_at?: string;
};

export type EmployeeCompensationComponent = {
  id?: number;
  component_name: string;
  component_type: "EARNING" | "DEDUCTION";
  amount: string;
  sort_order?: number;
  is_active?: boolean;
  notes?: string;
};

export type EmployeeAttendanceStatus =
  | "PRESENT"
  | "HALF_DAY"
  | "ABSENT"
  | "LEAVE";

export type EmployeeAttendance = {
  id: number;
  employee: number;
  employee_name?: string;
  employee_code?: string;
  employee_department?: string;
  attendance_date: string;
  status: EmployeeAttendanceStatus;
  worked_hours?: string;
  overtime_hours?: string;
  leave_request?: number | null;
  leave_request_no?: string | null;
  notes?: string;
  recorded_by?: number | null;
  recorded_by_username?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PayrollPeriod = {
  id: number;
  code: string;
  year: number;
  month: number;
  start_date: string;
  end_date: string;
  status: "OPEN" | "CLOSED";
  closed_at?: string | null;
  closed_by?: number | null;
  closed_by_username?: string | null;
  close_reason?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
};

export type LeaveType = {
  id: number;
  code: string;
  name: string;
  is_paid: boolean;
  annual_allowance_days?: string | null;
  is_active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
};

export type LeaveRequest = {
  id: number;
  request_no: string;
  employee: number;
  employee_name?: string;
  employee_code?: string;
  leave_type: number;
  leave_type_name?: string;
  start_date: string;
  end_date: string;
  day_count: string;
  status: "DRAFT" | "APPROVED" | "REJECTED" | "CANCELLED";
  reason?: string;
  notes?: string;
  approved_by?: number | null;
  approved_by_username?: string | null;
  approved_at?: string | null;
  rejected_by?: number | null;
  rejected_by_username?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string;
  cancelled_by?: number | null;
  cancelled_by_username?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string;
  created_at?: string;
  updated_at?: string;
};

export type SalarySheetLine = {
  id: number;
  component_name: string;
  component_type: "EARNING" | "DEDUCTION";
  source_type: "BASE_SALARY" | "COMPONENT" | "OVERTIME" | "LEAVE_DEDUCTION" | "MANUAL";
  source_reference?: string;
  quantity?: string | null;
  rate?: string | null;
  amount: string;
  sort_order?: number;
  notes?: string;
};

export type SalarySheet = {
  id: number;
  employee: number;
  employee_name?: string;
  employee_code?: string;
  employee_phone?: string;
  employee_designation?: string;
  employee_department?: string;
  payroll_period?: number | null;
  payroll_period_code?: string | null;
  payroll_period_status?: "OPEN" | "CLOSED" | null;
  year: number;
  month: number;
  gross_amount: string;
  deductions_amount: string;
  net_amount: string;
  status: "DRAFT" | "APPROVED" | "POSTED" | "PAID_PARTIAL" | "PAID";
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  payment_total?: string;
  outstanding_amount?: string;
  lines?: SalarySheetLine[];
  auto_generate?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SalaryPayment = {
  id: number;
  salary_sheet: number;
  salary_sheet_employee_name?: string;
  salary_sheet_employee_code?: string;
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  payment_date: string;
  amount: string;
  finance_account: number;
  finance_account_name?: string;
  reference_no?: string | null;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EmployeeExpenseClaim = {
  id: number;
  claim_no: string;
  employee: number;
  employee_name?: string;
  employee_code?: string;
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  claim_date: string;
  expense_date: string;
  category?: string;
  expense_account: number;
  expense_account_code?: string;
  expense_account_name?: string;
  claimed_amount: string;
  approved_amount: string;
  status: "DRAFT" | "APPROVED" | "POSTED" | "PAID_PARTIAL" | "PAID" | "REJECTED" | "CANCELLED";
  bill_no?: string;
  notes?: string;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  payment_total?: string;
  outstanding_amount?: string;
  payments?: EmployeeExpenseClaimPayment[];
  created_at?: string;
  updated_at?: string;
};

export type EmployeeExpenseClaimPayment = {
  id: number;
  expense_claim: number;
  expense_claim_no?: string;
  employee_name?: string;
  employee_code?: string;
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  payment_date: string;
  amount: string;
  finance_account: number;
  finance_account_name?: string;
  reference_no?: string | null;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AttendanceCalendarReport = {
  employee: {
    id: number;
    employee_code: string;
    name: string;
    department?: string;
  };
  year: number;
  month: number;
  days: Array<{
    date: string;
    status?: EmployeeAttendanceStatus | null;
    worked_hours: string;
    overtime_hours: string;
    notes?: string;
    leave_request_id?: number | null;
  }>;
  summary: {
    present_count: number;
    half_day_count: number;
    absent_count: number;
    leave_count: number;
    worked_hours: string;
    overtime_hours: string;
  };
};

export type StaffLedgerRow = {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  entry_date: string;
  entry_kind: "SALARY_ACCRUAL" | "SALARY_PAYMENT" | "REIMBURSEMENT_ACCRUAL" | "REIMBURSEMENT_PAYMENT";
  source_type: string;
  source_reference: string;
  document_no?: string | null;
  debit_amount: string;
  credit_amount: string;
  notes?: string;
  running_balance: string;
  balance_side: "PAYABLE" | "RECEIVABLE";
};

export type StaffLedgerEmployeeSummary = {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  closing_balance: string;
  balance_side: "PAYABLE" | "RECEIVABLE";
};

export type StaffLedgerReport = {
  employee_id?: number | null;
  rows: StaffLedgerRow[];
  employees: StaffLedgerEmployeeSummary[];
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

export type AccountingPeriodStatus = "OPEN" | "LOCKED" | "CLOSED";

export type FinancialYear = {
  id: number;
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  activated_at?: string | null;
  activated_by?: number | null;
  activated_by_username?: string | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
};

export type AccountingPeriod = {
  id: number;
  code: string;
  label: string;
  name?: string;
  start_date: string;
  end_date: string;
  financial_year?: number | null;
  financial_year_code?: string | null;
  financial_year_name?: string | null;
  status?: AccountingPeriodStatus;
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

export type AccountingPeriodReadiness = {
  reference_date: string;
  active_financial_year: FinancialYear | null;
  current_period: AccountingPeriod | null;
  posting_lock: PostingLock | null;
  is_ready: boolean;
  errors: string[];
  warnings: string[];
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
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  vendor: number;
  vendor_name?: string;
  tax_mode: string;
  status: "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";
  subtotal: string;
  tax_total: string;
  grand_total: string;
  stock_location?: number | null;
  stock_location_code?: string | null;
  stock_location_name?: string | null;
  finance_account?: number | null;
  finance_account_name?: string | null;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  notes?: string;
  lines?: AccountingPurchaseBillLine[];
};

export type AccountingPurchaseBillLine = {
  id?: number;
  inventory_item: number;
  inventory_item_sku?: string | null;
  inventory_item_product_name?: string | null;
  inventory_item_stock_item_type?: string | null;
  inventory_item_unit_of_measure?: string | null;
  description?: string;
  quantity: string;
  unit_cost: string;
  taxable_value?: string;
  tax_amount?: string;
  line_total?: string;
};

export type VendorSettlement = {
  id: number;
  settlement_no: string;
  vendor: number;
  vendor_name?: string;
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
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
    skipped_count?: number;
    skipped?: Array<Record<string, unknown>>;
    dry_run: boolean;
  }>;
};

export type AccountingSetupHealthIssue = {
  level?: "INFO" | "WARNING" | "ERROR" | string;
  code?: string;
  message?: string;
  affected_ids?: number[];
  repairable?: boolean;
  operator_action?: string;
};

export type AccountingSetupHealthResponse = {
  status: "OK" | "WARNING" | "BLOCKED";
  blockers: Array<string | AccountingSetupHealthIssue>;
  warnings: Array<string | AccountingSetupHealthIssue>;
  infos?: AccountingSetupHealthIssue[];
  issues?: Array<string | AccountingSetupHealthIssue>;
  generated_at?: string;
  finance_accounts: Record<
    "CASH" | "BANK" | "UPI",
    {
      active_count: number;
      active: Array<{
        id: number;
        name: string;
        chart_account_id: number;
        chart_account_code?: string | null;
        chart_account_name?: string | null;
        chart_account_is_active?: boolean | null;
      }>;
      linked_to_inactive_coa_ids: number[];
    }
  >;
  canonical_accounts: {
    missing: Array<{ key: string; code: string; name: string; account_type: string }>;
    present: Array<{ key: string; id: number; code: string; name: string; is_active: boolean; is_legacy?: boolean }>;
    claimable: Array<{ key: string; id: number; code: string; name: string }>;
    conflicts: Array<Record<string, unknown>>;
  };
  posting_profiles: {
    missing: string[];
    mapped: Array<{
      id: number;
      key: string;
      label: string;
      chart_account_id: number;
      chart_account_code?: string | null;
      chart_account_name?: string | null;
      chart_account_is_legacy?: boolean;
    }>;
    legacy_mapped: Array<{
      id: number;
      key: string;
      label: string;
      chart_account_id: number;
      chart_account_code?: string | null;
      chart_account_name?: string | null;
      chart_account_is_legacy?: boolean;
    }>;
  };
  coa: {
    total: number;
    legacy_count: number;
    duplicate_names: string[];
    system_code_conflicts: Array<Record<string, unknown>>;
  };
  journals: {
    posted_unbalanced_count: number;
    posted_zero_line_count: number;
    lines_to_inactive_accounts: number;
  };
  bridges: {
    missing_journal_count: number;
    legacy_brg_collection_count: number;
  };
};

export type AccountingSetupDefaultsPreviewResponse = {
  generated_at: string;
  canonical_accounts: {
    create: Array<{ key: string; code: string; name: string; account_type: string }>;
    claim: Array<{ key: string; id: number; code: string; name: string; account_type: string }>;
    present: Array<Record<string, unknown>>;
    conflicts: Array<Record<string, unknown>>;
    inactive: Array<Record<string, unknown>>;
  };
  finance_accounts: {
    to_create: Array<Record<string, unknown>>;
    duplicates: Record<string, unknown>;
  };
  posting_profiles: {
    to_create: Array<Record<string, unknown>>;
    to_update: Array<Record<string, unknown>>;
  };
  legacy_candidates: {
    coa_duplicates_to_mark_legacy: Array<Record<string, unknown>>;
  };
  manual_review: string[];
};
export type AccountingSetupDefaultsApplyResponse = Record<string, unknown>;

export function getAccountingSetupHealth() {
  return apiFetch<AccountingSetupHealthResponse>("/admin/accounting/setup-health/");
}

export function previewAccountingSetupDefaults() {
  return apiFetch<AccountingSetupDefaultsPreviewResponse>("/admin/accounting/setup-defaults/preview/", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function applyAccountingSetupDefaults(payload: { confirm: true }) {
  return apiFetch<AccountingSetupDefaultsApplyResponse>("/admin/accounting/setup-defaults/apply/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

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

export function getChartOfAccount(id: number) {
  return apiFetch<ChartOfAccountDetail>(`/accounting/chart-of-accounts/${id}/`);
}

export function updateChartOfAccount(id: number, payload: Partial<ChartOfAccount>) {
  return apiFetch<ChartOfAccountDetail>(`/accounting/chart-of-accounts/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getChartOfAccountEditability(id: number) {
  return apiFetch<AccountingEditabilityEnvelope<ChartOfAccountDetail>>(
    `/accounting/chart-of-accounts/${id}/editability/`
  );
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

export function getFinanceAccount(id: number) {
  return apiFetch<FinanceAccountDetail>(`/accounting/finance-accounts/${id}/`);
}

export function updateFinanceAccount(id: number, payload: Partial<FinanceAccount>) {
  return apiFetch<FinanceAccountDetail>(`/accounting/finance-accounts/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getFinanceAccountEditability(id: number) {
  return apiFetch<AccountingEditabilityEnvelope<FinanceAccountDetail>>(
    `/accounting/finance-accounts/${id}/editability/`
  );
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

export function updateVendor(id: number, payload: Partial<Vendor>) {
  return apiFetch<Vendor>(`/accounting/vendors/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getVendorOperationalSummary(id: number) {
  return apiFetch<VendorOperationalSummary>(
    `/accounting/vendors/${id}/operational-summary/`
  );
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

export function updateEmployeeProfile(id: number, payload: Partial<EmployeeProfile>) {
  return apiFetch<EmployeeProfile>(`/accounting/employees/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function listEmployeeAttendance(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<EmployeeAttendance>>(
    `/accounting/attendance/${buildQuery(params)}`
  );
}

export function recordEmployeeAttendance(payload: Partial<EmployeeAttendance>) {
  return apiFetch<EmployeeAttendance>("/accounting/attendance/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAttendanceCalendar(params: {
  employee: number;
  year: number;
  month: number;
}) {
  return apiFetch<AttendanceCalendarReport>(
    `/accounting/reports/attendance-calendar/${buildQuery(params)}`
  );
}

export function listPayrollPeriods(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<PayrollPeriod>>(
    `/accounting/payroll-periods/${buildQuery(params)}`
  );
}

export function closePayrollPeriod(id: number, close_reason = "") {
  return apiFetch<AccountingActionResponse<{ payroll_period: PayrollPeriod }>>(
    `/accounting/payroll-periods/${id}/close/`,
    {
      method: "POST",
      body: JSON.stringify({ close_reason }),
    }
  );
}

export function listLeaveTypes(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<LeaveType>>(
    `/accounting/leave-types/${buildQuery(params)}`
  );
}

export function createLeaveType(payload: Partial<LeaveType>) {
  return apiFetch<LeaveType>("/accounting/leave-types/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listLeaveRequests(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<LeaveRequest>>(
    `/accounting/leave-requests/${buildQuery(params)}`
  );
}

export function createLeaveRequest(payload: Partial<LeaveRequest>) {
  return apiFetch<LeaveRequest>("/accounting/leave-requests/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function approveLeaveRequest(id: number) {
  return apiFetch<AccountingActionResponse<{ leave_request: LeaveRequest }>>(
    `/accounting/leave-requests/${id}/approve/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function rejectLeaveRequest(id: number, reason: string) {
  return apiFetch<AccountingActionResponse<{ leave_request: LeaveRequest }>>(
    `/accounting/leave-requests/${id}/reject/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function cancelLeaveRequest(id: number, reason: string) {
  return apiFetch<AccountingActionResponse<{ leave_request: LeaveRequest }>>(
    `/accounting/leave-requests/${id}/cancel/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function listSalarySheets(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<SalarySheet>>(
    `/accounting/salary-sheets/${buildQuery(params)}`
  );
}

/**
 * Dashboard-safe salary sheet summary.
 * Salary sheets moved from /accounting/salary-sheets/ to /admin/hr/payroll/
 * (HR consolidation). That endpoint returns { salary_sheets: [...] } (no
 * pagination), so we adapt it to the paginated shape and optionally filter by
 * status. Always resolves (never throws) so a single widget can't break the
 * dashboard.
 */
export async function listSalarySheetsSafe(
  params: Record<string, string | number | undefined | null> = {}
): Promise<AccountingPaginatedResponse<SalarySheet>> {
  const empty: AccountingPaginatedResponse<SalarySheet> = {
    count: 0,
    next: null,
    previous: null,
    results: [],
  };
  try {
    const { status, ...rest } = params;
    const res = await apiFetch<{ salary_sheets?: SalarySheet[] }>(
      `/admin/hr/payroll/${buildQuery(rest)}`
    );
    let sheets = Array.isArray(res?.salary_sheets) ? res.salary_sheets : [];
    if (status) {
      const wanted = String(status).toUpperCase();
      sheets = sheets.filter(
        (sheet) => String((sheet as { status?: string }).status ?? "").toUpperCase() === wanted
      );
    }
    return { ...empty, count: sheets.length, results: sheets };
  } catch {
    return empty;
  }
}

export function createSalarySheet(payload: Partial<SalarySheet>) {
  return apiFetch<SalarySheet>("/accounting/salary-sheets/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSalarySheet(id: number) {
  return apiFetch<SalarySheet>(`/accounting/salary-sheets/${id}/`);
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

export function listSalaryPayments(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<SalaryPayment>>(
    `/accounting/salary-payments/${buildQuery(params)}`
  );
}

export function createSalaryPayment(payload: Partial<SalaryPayment>) {
  return apiFetch<SalaryPayment>("/accounting/salary-payments/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listExpenseClaims(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<EmployeeExpenseClaim>>(
    `/accounting/expense-claims/${buildQuery(params)}`
  );
}

/**
 * Dashboard-safe expense claim summary.
 * Expense claims moved from /accounting/expense-claims/ to
 * /admin/hr/expense-claims/ (HR consolidation). That endpoint already returns
 * { count, results } and filters by status server-side. Never throws, so a
 * single widget can't break the dashboard.
 */
export async function listExpenseClaimsSafe(
  params: Record<string, string | number | undefined | null> = {}
): Promise<AccountingPaginatedResponse<EmployeeExpenseClaim>> {
  const empty: AccountingPaginatedResponse<EmployeeExpenseClaim> = {
    count: 0,
    next: null,
    previous: null,
    results: [],
  };
  try {
    const res = await apiFetch<Partial<AccountingPaginatedResponse<EmployeeExpenseClaim>>>(
      `/admin/hr/expense-claims/${buildQuery(params)}`
    );
    return {
      ...empty,
      count: Number(res?.count ?? (res?.results?.length ?? 0)),
      results: Array.isArray(res?.results) ? res.results : [],
    };
  } catch {
    return empty;
  }
}

export function createExpenseClaim(payload: Partial<EmployeeExpenseClaim>) {
  return apiFetch<EmployeeExpenseClaim>("/accounting/expense-claims/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateExpenseClaim(id: number, payload: Partial<EmployeeExpenseClaim>) {
  return apiFetch<EmployeeExpenseClaim>(`/accounting/expense-claims/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function approveExpenseClaim(id: number, approved_amount?: string) {
  return apiFetch<AccountingActionResponse<{ expense_claim: EmployeeExpenseClaim }>>(
    `/accounting/expense-claims/${id}/approve/`,
    {
      method: "POST",
      body: JSON.stringify(approved_amount ? { approved_amount } : {}),
    }
  );
}

export function rejectExpenseClaim(id: number, reason: string) {
  return apiFetch<AccountingActionResponse<{ expense_claim: EmployeeExpenseClaim }>>(
    `/accounting/expense-claims/${id}/reject/`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function postExpenseClaim(id: number) {
  return apiFetch<AccountingActionResponse<{ expense_claim: EmployeeExpenseClaim }>>(
    `/accounting/expense-claims/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function listExpenseClaimPayments(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<EmployeeExpenseClaimPayment>>(
    `/accounting/expense-claim-payments/${buildQuery(params)}`
  );
}

export function createExpenseClaimPayment(payload: Partial<EmployeeExpenseClaimPayment>) {
  return apiFetch<EmployeeExpenseClaimPayment>("/accounting/expense-claim-payments/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getStaffLedger(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<StaffLedgerReport>(`/accounting/reports/staff-ledger/${buildQuery(params)}`);
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
  return downloadAuthenticatedFile(
    `/accounting/exports/itr-pack/${id}/download/`,
    `itr-pack-${id}.zip`
  );
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

export function listFinancialYears(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<AccountingPaginatedResponse<FinancialYear>>(
    `/accounting/financial-years/${buildQuery(params)}`
  );
}

export function createFinancialYear(payload: {
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  notes?: string;
}) {
  return apiFetch<FinancialYear>("/accounting/financial-years/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function activateFinancialYear(id: number) {
  return apiFetch<AccountingActionResponse<{ financial_year: FinancialYear }>>(
    `/accounting/financial-years/${id}/activate/`,
    { method: "POST" }
  );
}

export function generateAccountingPeriods(financialYearId: number) {
  return apiFetch<
    AccountingActionResponse<{
      financial_year: FinancialYear;
      periods: AccountingPeriod[];
      created_count: number;
    }>
  >(`/accounting/financial-years/${financialYearId}/generate-periods/`, {
    method: "POST",
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

export function updateAccountingPeriodStatus(id: number, status: AccountingPeriodStatus, reason = "") {
  return apiFetch<AccountingActionResponse<{ period: AccountingPeriod }>>(
    `/accounting/periods/${id}/status/`,
    {
      method: "POST",
      body: JSON.stringify({ status, reason }),
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
  return updateAccountingPeriodStatus(id, "CLOSED", reason);
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

export function getAccountingPeriodsReadiness() {
  return apiFetch<AccountingPeriodReadiness>("/accounting/periods/readiness/");
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

export function createPurchaseBill(payload: Partial<AccountingPurchaseBill>) {
  return apiFetch<AccountingPurchaseBill>("/accounting/purchase-bills/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePurchaseBill(id: number, payload: Partial<AccountingPurchaseBill>) {
  return apiFetch<AccountingPurchaseBill>(`/accounting/purchase-bills/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
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

// ─────────────────────────────────────────────────────────────────────────────
// P4D Close Cockpit
// ─────────────────────────────────────────────────────────────────────────────

export type CloseCockpitSection = {
  status: string;
  deferred?: boolean;
  message?: string;
  [key: string]: unknown;
};

export type CloseCockpitBlocker = {
  key: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  description: string;
  source_area: string;
};

export type CloseCockpitActionItem = {
  key: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  description: string;
  source_area: string;
  count: number;
  deferred: boolean;
  action_url?: string;
};

export type CloseCockpitPeriodState = {
  year: number;
  month: number;
  period_start: string;
  period_end: string;
  period_code: string | null;
  period_id: number | null;
  status: string | null;
  is_locked: boolean;
  is_closed: boolean;
};

export type CloseCockpitPeriodLock = {
  period_exists: boolean;
  period_id: number | null;
  period_code: string | null;
  status: string | null;
  is_locked: boolean;
  is_closed: boolean;
  lock_allowed: boolean;
  lock_blockers: string[];
  manual_lock_required: boolean;
  existing_lock_endpoint: string;
};

export type CloseCockpitPayload = {
  period: { year: number; month: number };
  as_of: string;
  overall_status: "OK" | "INFO" | "WARNING" | "CRITICAL";
  can_close: boolean;
  can_lock: boolean;
  period_state: CloseCockpitPeriodState;
  sections: {
    month_end: CloseCockpitSection;
    financial_intelligence: CloseCockpitSection;
    trial_balance: CloseCockpitSection;
    liability_reconciliation: CloseCockpitSection;
    period_lock: CloseCockpitPeriodLock;
  };
  blockers: CloseCockpitBlocker[];
  warnings: CloseCockpitBlocker[];
  action_items: CloseCockpitActionItem[];
  metadata: { generated_at: string; read_only: boolean; note: string };
};

export function getAccountingCloseCockpit(
  params: { year?: number; month?: number; as_of?: string } = {}
) {
  const qs = new URLSearchParams();
  if (params.year != null) qs.set("year", String(params.year));
  if (params.month != null) qs.set("month", String(params.month));
  if (params.as_of) qs.set("as_of", params.as_of);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<CloseCockpitPayload>(`/admin/accounting/close-cockpit/${query}`);
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

// ─── P4E Export-Ready Accounting Reports ─────────────────────────────────────

export type AccountingExportRow = Record<string, string | number | boolean>;

export type AccountingExportPayload = {
  report_key: string;
  period: { year: number; month: number };
  as_of: string;
  columns: string[];
  rows: AccountingExportRow[];
  totals: Record<string, string | number | boolean>;
  warnings: string[];
  metadata: Record<string, unknown>;
};

export type AccountingExportReportMeta = {
  key: string;
  title: string;
  description: string;
  endpoint: string;
  formats: string[];
};

export type AccountingExportIndex = {
  report_key: string;
  period: { year: number; month: number };
  as_of: string;
  period_start: string;
  period_end: string;
  reports: AccountingExportReportMeta[];
  metadata: Record<string, unknown>;
};

function _exportQuery(params: {
  year?: number | null;
  month?: number | null;
  as_of?: string | null;
  format?: string;
  include_draft?: boolean;
  limit?: number | null;
}): string {
  const qs = new URLSearchParams();
  if (params.year != null) qs.set("year", String(params.year));
  if (params.month != null) qs.set("month", String(params.month));
  if (params.as_of) qs.set("as_of", params.as_of);
  if (params.format) qs.set("export_format", params.format);
  if (params.include_draft) qs.set("include_draft", "true");
  if (params.limit != null) qs.set("limit", String(params.limit));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function fetchAccountingExportIndex(params: {
  year?: number | null;
  month?: number | null;
  as_of?: string | null;
} = {}) {
  return apiFetch<AccountingExportIndex>(
    `/admin/accounting/exports/${_exportQuery(params)}`
  );
}

export function fetchTrialBalanceExport(params: {
  year?: number | null;
  month?: number | null;
  as_of?: string | null;
} = {}) {
  return apiFetch<AccountingExportPayload>(
    `/admin/accounting/exports/trial-balance/${_exportQuery(params)}`
  );
}

export function fetchJournalExport(params: {
  year?: number | null;
  month?: number | null;
  as_of?: string | null;
  include_draft?: boolean;
  limit?: number | null;
} = {}) {
  return apiFetch<AccountingExportPayload>(
    `/admin/accounting/exports/journals/${_exportQuery(params)}`
  );
}

export function fetchLedgerExport(params: {
  year?: number | null;
  month?: number | null;
  as_of?: string | null;
} = {}) {
  return apiFetch<AccountingExportPayload>(
    `/admin/accounting/exports/ledgers/${_exportQuery(params)}`
  );
}

export function fetchReceivablesExport(params: {
  year?: number | null;
  month?: number | null;
  as_of?: string | null;
} = {}) {
  return apiFetch<AccountingExportPayload>(
    `/admin/accounting/exports/receivables/${_exportQuery(params)}`
  );
}

export function fetchLiabilityExport(params: {
  year?: number | null;
  month?: number | null;
  as_of?: string | null;
} = {}) {
  return apiFetch<AccountingExportPayload>(
    `/admin/accounting/exports/liabilities/${_exportQuery(params)}`
  );
}

export function fetchBridgeAuditExport(params: {
  year?: number | null;
  month?: number | null;
  as_of?: string | null;
  limit?: number | null;
} = {}) {
  return apiFetch<AccountingExportPayload>(
    `/admin/accounting/exports/bridge-audit/${_exportQuery(params)}`
  );
}

export async function downloadAccountingExportCsv(
  reportKey: "trial-balance" | "journals" | "ledgers" | "receivables" | "liabilities" | "bridge-audit",
  params: {
    year?: number | null;
    month?: number | null;
    as_of?: string | null;
    include_draft?: boolean;
  } = {}
): Promise<void> {
  const query = _exportQuery({ ...params, format: "csv" });
  const period = params.year && params.month
    ? `${params.year}-${String(params.month).padStart(2, "0")}`
    : "export";
  return downloadAuthenticatedFile(
    `/admin/accounting/exports/${reportKey}/${query}`,
    `${reportKey}-${period}.csv`
  );
}
