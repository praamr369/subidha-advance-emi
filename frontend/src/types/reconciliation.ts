export type ReconciliationRunStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | string;

export type ReconciliationSeverity =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL"
  | string;

export type ReconciliationItemStatus =
  | "MATCHED"
  | "MISSING_LEDGER"
  | "MISSING_SOURCE"
  | "AMOUNT_MISMATCH"
  | "QUANTITY_MISMATCH"
  | "STATUS_MISMATCH"
  | "DUPLICATE_POSTING"
  | "WRONG_ACCOUNT"
  | "NEEDS_REVIEW"
  | "RESOLVED"
  | "FALSE_POSITIVE"
  | "WAIVED_BY_APPROVAL"
  | string;

export type ReconciliationResolutionAction =
  | "MARK_REVIEWED"
  | "MARK_FALSE_POSITIVE"
  | "REQUEST_CORRECTION"
  | "LINK_EXISTING_RECORD"
  | "CREATE_ADJUSTMENT_REQUEST"
  | "ESCALATE"
  | "CLOSE"
  | "REOPEN"
  | string;

export type ReconciliationRun = {
  id: number;
  run_no: number;
  scope: string;
  module: string;
  branch?: number | null;
  date_from?: string | null;
  date_to?: string | null;
  financial_year?: string | null;
  accounting_period?: string | null;
  status: ReconciliationRunStatus;
  started_by: number;
  started_by_username?: string | null;
  started_at: string;
  finished_at?: string | null;
  total_checked: number;
  total_matched: number;
  total_exceptions: number;
  high_risk_count: number;
  metadata?: Record<string, unknown>;
};

export type ReconciliationEvidence = {
  id: number;
  evidence_type: string;
  content_type?: number | null;
  object_id?: string | null;
  label?: string;
  amount?: string | null;
  quantity?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type ReconciliationResolution = {
  id: number;
  action: ReconciliationResolutionAction;
  note: string;
  before_status?: string;
  after_status?: string;
  resolved_by: number;
  resolved_by_username?: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
};

export type ReconciliationItem = {
  id: number;
  run: number;
  run_no?: number;
  module: string;
  source_type: string;
  source_id: string;
  source_label?: string;
  expected_amount?: string | null;
  actual_amount?: string | null;
  amount_delta?: string | null;
  expected_quantity?: string | null;
  actual_quantity?: string | null;
  quantity_delta?: string | null;
  severity: ReconciliationSeverity;
  status: ReconciliationItemStatus;
  exception_code: string;
  exception_message?: string;
  recommended_action?: string;
  action_href?: string | null;
  assigned_to?: number | null;
  resolved_by?: number | null;
  resolved_at?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ReconciliationItemDetail = ReconciliationItem & {
  evidence?: ReconciliationEvidence[];
  resolutions?: ReconciliationResolution[];
};

export type ReconciliationModuleSummary = {
  module: string;
  open_count: number;
  high_risk_count: number;
  exception_codes?: Array<{ exception_code: string; count: number }>;
};

export type PaginatedResponse<T> = {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
};
