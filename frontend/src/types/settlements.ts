export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type SettlementSourceType = "BANK_STATEMENT_LINE" | "UPI_SETTLEMENT_LINE";

export type BankStatementImport = {
  id: number;
  import_no: string;
  bank_finance_account: number;
  bank_finance_account_name?: string;
  statement_period_from: string;
  statement_period_to: string;
  uploaded_file?: string;
  uploaded_by: number;
  uploaded_by_username?: string;
  uploaded_at: string;
  status: string;
  checksum: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type BankStatementLine = {
  id: number;
  statement_import: number;
  transaction_date: string;
  value_date?: string | null;
  description: string;
  reference_no?: string | null;
  debit: string;
  credit: string;
  balance?: string | null;
  raw_payload?: Record<string, unknown> | null;
  normalized_reference?: string | null;
  matched_status: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type UpiSettlementImport = {
  id: number;
  import_no: string;
  upi_finance_account: number;
  upi_finance_account_name?: string;
  settlement_date: string;
  uploaded_file?: string;
  uploaded_by: number;
  uploaded_by_username?: string;
  uploaded_at: string;
  status: string;
  checksum: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type UpiSettlementLine = {
  id: number;
  settlement_import: number;
  transaction_ref: string;
  payment_ref?: string | null;
  gross_amount: string;
  fee_amount: string;
  net_amount: string;
  settlement_date: string;
  raw_payload?: Record<string, unknown> | null;
  matched_status: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type SettlementAllocation = {
  id: number;
  source_type: SettlementSourceType;
  source_id: string;
  finance_account: number;
  finance_account_name?: string;
  matched_amount: string;
  status: string;
  payment?: number | null;
  receipt?: number | null;
  money_movement?: number | null;
  matched_by?: number | null;
  matched_by_username?: string;
  matched_at?: string | null;
  confidence?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type BankImportCreatePayload = {
  bank_finance_account: number;
  statement_period_from: string;
  statement_period_to: string;
  uploaded_file: File;
};

export type UpiImportCreatePayload = {
  upi_finance_account: number;
  settlement_date: string;
  uploaded_file: File;
};

export type SettlementAllocationCreatePayload = {
  source_type: SettlementSourceType;
  source_id: string;
  finance_account: number;
  matched_amount: string;
  payment?: number | null;
  receipt?: number | null;
  money_movement?: number | null;
  note?: string;
};

export type SettlementAllocationVoidPayload = {
  reason?: string;
};
