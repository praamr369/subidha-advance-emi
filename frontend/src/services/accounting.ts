import { apiFetch } from "@/lib/api";

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
