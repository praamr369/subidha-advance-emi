import { apiFetch } from "@/lib/api";

// ── Approval types ────────────────────────────────────────────────────────────

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
export type ControlSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type ApprovalRequest = {
  id: number;
  approval_key: string;
  source_model: string;
  source_id: number;
  title: string;
  message: string;
  severity: ControlSeverity;
  status: ApprovalStatus;
  requested_by: number;
  requested_by_username: string;
  decided_by: number | null;
  decided_by_username: string | null;
  decision_note: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

// ── Policy types ──────────────────────────────────────────────────────────────

export type BusinessPolicy = {
  id: number;
  policy_key: string;
  is_enabled: boolean;
  description: string;
  updated_by: number | null;
  updated_by_username: string | null;
  updated_at: string;
  created_at: string;
};

// ── Exception types ───────────────────────────────────────────────────────────

export type ExceptionStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "SUPPRESSED";

export type ControlException = {
  id: number;
  exception_key: string;
  source_model: string;
  source_id: number;
  title: string;
  message: string;
  severity: ControlSeverity;
  status: ExceptionStatus;
  raised_by: number | null;
  raised_by_username: string | null;
  action_url: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

// ── Cash session types ────────────────────────────────────────────────────────

export type CashSessionStatus = "OPEN" | "CLOSED";

export type CashCounterSession = {
  id: number;
  counter: number;
  counter_name: string;
  opened_by: number;
  opened_by_username: string;
  status: CashSessionStatus;
  opening_cash: string;
  declared_cash: string | null;
  closing_cash: string | null;
  variance: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
};

// ── Daily close types ─────────────────────────────────────────────────────────

export type CloseCheckSeverity = "INFO" | "WARNING" | "BLOCKING";
export type CloseRunStatus = "DRY_RUN" | "EXECUTED" | "BLOCKED";

export type CloseCheckResult = {
  check_key: string;
  severity: CloseCheckSeverity;
  passed: boolean;
  count: number;
  detail: string;
};

export type DailyCloseRun = {
  id: number;
  close_date: string;
  branch: number | null;
  branch_name: string | null;
  run_by: number;
  run_by_username: string;
  is_dry_run: boolean;
  status: CloseRunStatus;
  notes: string;
  run_at: string;
  checks: CloseCheckResult[];
};

export type DailyCloseReadiness = {
  can_execute: boolean;
  blocking_count: number;
  checks: CloseCheckResult[];
};

// ── Month-end close types ─────────────────────────────────────────────────────

export type MonthEndCloseRun = {
  id: number;
  period_year: number;
  period_month: number;
  branch: number | null;
  branch_name: string | null;
  run_by: number;
  run_by_username: string;
  is_dry_run: boolean;
  status: CloseRunStatus;
  notes: string;
  run_at: string;
  checks: CloseCheckResult[];
};

export type MonthEndReadiness = {
  can_execute: boolean;
  blocking_count: number;
  checks: CloseCheckResult[];
};

export type MonthEndExecutePayload = {
  year: number;
  month: number;
  is_dry_run: boolean;
  branch_id?: number | null;
  notes?: string;
};

// ── Data quality types ────────────────────────────────────────────────────────

export type DQSeverity = "CRITICAL" | "WARNING" | "INFO";

export type DQCheck = {
  check_key: string;
  severity: DQSeverity;
  passed: boolean;
  count: number;
  detail: string;
};

export type DQReport = {
  critical_count: number;
  warning_count: number;
  total_issues: number;
  checks: DQCheck[];
};

// ── API fetch functions ───────────────────────────────────────────────────────

export async function getApprovals(): Promise<ApprovalRequest[]> {
  const data = await apiFetch<ApprovalRequest[] | { results?: ApprovalRequest[] }>("/admin/control/approvals/");
  return Array.isArray(data) ? data : (data.results ?? []);
}

export async function getPolicies(): Promise<BusinessPolicy[]> {
  const data = await apiFetch<BusinessPolicy[] | { results?: BusinessPolicy[] }>("/admin/control/policies/");
  return Array.isArray(data) ? data : (data.results ?? []);
}

export async function getExceptions(): Promise<ControlException[]> {
  const data = await apiFetch<ControlException[] | { results?: ControlException[] }>("/admin/control/exceptions/");
  return Array.isArray(data) ? data : (data.results ?? []);
}

export async function getCashSessions(): Promise<CashCounterSession[]> {
  const data = await apiFetch<CashCounterSession[] | { results?: CashCounterSession[] }>("/admin/control/cash-sessions/");
  return Array.isArray(data) ? data : (data.results ?? []);
}

export async function getDailyCloseReadiness(params?: { date?: string; branch_id?: number }): Promise<DailyCloseReadiness> {
  const qs = new URLSearchParams();
  if (params?.date) qs.set("date", params.date);
  if (params?.branch_id != null) qs.set("branch_id", String(params.branch_id));
  const q = qs.toString();
  return apiFetch<DailyCloseReadiness>(`/admin/control/daily-close/readiness/${q ? `?${q}` : ""}`);
}

export async function getDailyCloseHistory(): Promise<DailyCloseRun[]> {
  const data = await apiFetch<DailyCloseRun[] | { results?: DailyCloseRun[] }>("/admin/control/daily-close/history/");
  return Array.isArray(data) ? data : (data.results ?? []);
}

export async function getMonthEndReadiness(year: number, month: number, branch_id?: number): Promise<MonthEndReadiness> {
  const qs = new URLSearchParams({ year: String(year), month: String(month) });
  if (branch_id != null) qs.set("branch_id", String(branch_id));
  return apiFetch<MonthEndReadiness>(`/admin/control/month-end-close/readiness/?${qs.toString()}`);
}

export async function executeMonthEndClose(payload: MonthEndExecutePayload): Promise<MonthEndCloseRun> {
  return apiFetch<MonthEndCloseRun>("/admin/control/month-end-close/execute/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getMonthEndHistory(): Promise<MonthEndCloseRun[]> {
  const data = await apiFetch<MonthEndCloseRun[] | { results?: MonthEndCloseRun[] }>("/admin/control/month-end-close/history/");
  return Array.isArray(data) ? data : (data.results ?? []);
}

export async function getDataQualityReport(): Promise<DQReport> {
  return apiFetch<DQReport>("/admin/data-quality/");
}
