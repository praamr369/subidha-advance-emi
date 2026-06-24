import { apiFetch, toArray } from "@/lib/api";
import { downloadAuthenticatedFile } from "@/lib/export/auth-download";

export type HrSummary = {
  as_of: string;
  total_active_staff: number;
  today_present: number;
  today_absent: number;
  pending_leave_requests: number;
  pending_expense_claims: number;
  payroll_pending: number;
  salary_payment_pending: number;
  branch_assignment_summary: Array<{ branch_id: number | null; count: number }>;
  counter_assignment_summary: Array<{ branch_id: number | null; assigned_count: number }>;
};

export type HrOption = { value: string; label: string };

export type HrStaffOptions = {
  employment_statuses: HrOption[];
  employment_types: HrOption[];
  payment_modes: HrOption[];
  user_roles: HrOption[];
  departments: HrOption[];
  roles_titles: HrOption[];
  attendance_policies: HrOption[];
  shifts: HrOption[];
  weekly_offs: HrOption[];
  cost_centers: HrOption[];
  kyc_statuses: HrOption[];
  kyc_types: HrOption[];
  emergency_relations: HrOption[];
  payroll_accounting: { enabled: boolean; message: string };
  unsupported_profile_fields?: Array<{ field: string; reason: string }>;
};

export type HrStaff = {
  id: number;
  employee_code: string;
  name: string;
  phone: string;
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  designation?: string;
  department?: string;
  employment_status?: string;
  employment_type?: string;
  weekly_off?: string;
  reporting_manager?: string;
  work_location?: string;
  probation_end_date?: string | null;
  attendance_policy?: string;
  shift_name?: string;
  salary_effective_from?: string | null;
  temporary_contract_end_date?: string | null;
  daily_wage_rate?: string | null;
  hourly_wage_rate?: string | null;
  piece_rate_amount?: string | null;
  piece_rate_unit_label?: string;
  payroll_eligible?: boolean;
  payment_mode?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  upi_id?: string;
  kyc_id_type?: string;
  kyc_id_number?: string;
  kyc_verified?: boolean;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_relation?: string;
  emergency_contact_phone?: string;
  cost_center_code?: string;
  payroll_expense_account?: number | null;
  deactivation_reason?: string;
  deactivated_at?: string | null;
  deactivated_by?: number | null;
  profile_ready?: boolean;
  employment_ready?: boolean;
  payroll_ready?: boolean;
  attendance_ready?: boolean;
  documents_ready?: boolean;
  access_ready?: boolean;
  login_created?: boolean;
  readiness_warnings?: string[];
  pay_basis?: string;
  salary_type?: string;
  notes?: string;
  joining_date: string;
  base_salary?: string | null;
  standard_daily_hours?: string | null;
  overtime_rate_per_hour?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type HrStaffDocument = {
  id: number;
  employee: number;
  employee_name: string;
  employee_code: string;
  document_type: string;
  title: string;
  document_no: string;
  file_url?: string | null;
  status: string;
  notes: string;
  uploaded_by_username?: string | null;
  created_at: string;
  updated_at?: string;
};

export type HrAttendance = {
  id: number;
  employee: number;
  employee_name: string;
  attendance_date: string;
  status: string;
  worked_hours: string;
  overtime_hours: string;
  notes: string;
};

export type HrLeaveRequest = {
  id: number;
  request_no: string;
  employee: number;
  employee_name: string;
  leave_type: number;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  day_count: string;
  status: string;
  reason: string;
};

export type HrExpenseClaim = {
  id: number;
  claim_no: string;
  employee: number;
  employee_name: string;
  claim_date: string;
  amount: string;
  status: string;
  purpose: string;
  notes: string;
};

export type HrPayrollSheet = {
  id: number;
  employee: number;
  employee_name: string;
  employee_code: string;
  payroll_period_code?: string;
  payroll_period_status?: string;
  year: number;
  month: number;
  gross_amount: string;
  deductions_amount: string;
  net_amount: string;
  status: string;
  payment_total?: string;
  outstanding_amount?: string;
  created_at?: string;
};

export type HrSalaryPayment = {
  id: number;
  salary_sheet: number;
  salary_sheet_employee_name?: string;
  salary_sheet_employee_code?: string;
  payment_date: string;
  amount: string;
  branch_name?: string | null;
  finance_account_name?: string | null;
  reference_no?: string;
  created_at?: string;
};

export type AdminAuditEntry = {
  id: number;
  action_type: string;
  model_name: string;
  object_id: string;
  performed_by?: number | null;
  performed_by_username?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export async function getHrSummary() {
  return apiFetch<HrSummary>("/admin/hr/summary/");
}

export async function getAdminAuditTimeline(modelName: string, objectId: number | string) {
  const payload = await apiFetch<AdminAuditEntry[] | { results?: AdminAuditEntry[] }>(`/admin/audit-logs/timeline/${encodeURIComponent(modelName)}/${encodeURIComponent(String(objectId))}/`);
  return toArray<AdminAuditEntry>(payload).map((entry) => ({
    ...entry,
    metadata: entry.metadata ?? {},
  }));
}

export async function getHrStaffOptions() {
  return apiFetch<HrStaffOptions>("/admin/hr/staff/options/");
}

type StaffListParams = {
  q?: string;
  is_active?: string;
  status?: string;
  employment_status?: string;
  department?: string;
  employment_type?: string;
  branch?: string | number;
  payroll_ready?: string;
  payroll_eligible?: string;
  kyc_verified?: string;
};

function queryString(params: Record<string, string | number | undefined | null> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function listHrStaff(params: StaffListParams = {}) {
  return apiFetch<{ count: number; results: HrStaff[] }>(`/admin/hr/staff/${queryString(params)}`);
}

export async function getHrStaff(staffId: number | string) {
  return apiFetch<HrStaff>(`/admin/hr/staff/${staffId}/`);
}

export type HrStaffCreatePayload = {
  full_name?: string;
  name: string;
  phone: string;
  email?: string;
  user_role?: "STAFF";
  username?: string;
  temporary_password?: string;
  branch?: number | null;
  cash_counter?: number | null;
  joining_date?: string | null;
  is_active?: boolean;
  employment_status?: "DRAFT" | "ONBOARDING" | "ACTIVE" | "INACTIVE";
  base_salary?: string | null;
  designation?: string;
  title?: string;
  department?: string;
  employment_type?:
    | "PERMANENT_MONTHLY"
    | "TEMPORARY"
    | "DAILY_WAGE"
    | "HOURLY"
    | "PIECE_RATE"
    | "MANUFACTURING"
    | "SERVICE";
  staff_type?: string;
  reporting_manager?: string;
  work_location?: string;
  probation_end_date?: string | null;
  attendance_policy?: string;
  shift_name?: string;
  shift?: string;
  weekly_off?: string;
  salary_effective_from?: string | null;
  salary_effective_date?: string | null;
  temporary_contract_end_date?: string | null;
  daily_wage_rate?: string | null;
  hourly_wage_rate?: string | null;
  piece_rate_amount?: string | null;
  piece_rate_unit_label?: string;
  payroll_eligible?: boolean;
  salary_type?: string;
  payment_mode?: "CASH" | "BANK" | "UPI";
  bank_account_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  upi_id?: string;
  kyc_status?: "PENDING" | "VERIFIED" | "REJECTED";
  kyc_type?: string;
  kyc_reference?: string;
  kyc_id_type?: string;
  kyc_id_number?: string;
  kyc_verified?: boolean;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_relation?: string;
  emergency_contact_phone?: string;
  emergency_phone?: string;
  cost_center?: string;
  cost_center_code?: string;
  payroll_expense_account?: number | null;
  create_login_account?: boolean;
  notes?: string;
};

export async function createHrStaff(payload: HrStaffCreatePayload) {
  return apiFetch<{ employee: HrStaff; workflow_status?: string; user_id?: number | null; staff_identity_id?: number | null; temporary_password?: string | null }>("/admin/hr/staff/", { method: "POST", body: JSON.stringify(payload) });
}

export async function patchHrStaff(staffId: number, payload: Record<string, unknown>) {
  return apiFetch(`/admin/hr/staff/${staffId}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function listHrAttendance(params = "") {
  return apiFetch<{ count: number; results: HrAttendance[] }>(`/admin/hr/attendance/${params ? `?${params}` : ""}`);
}

export async function markHrAttendance(payload: { employee: number; attendance_date?: string; status: string; notes?: string; worked_hours?: string | null; overtime_hours?: string | null }) {
  return apiFetch("/admin/hr/attendance/", { method: "POST", body: JSON.stringify(payload) });
}

export async function listHrLeaveRequests(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<{ count: number; results: HrLeaveRequest[] }>(`/admin/hr/leave-requests/${queryString(params)}`);
}

export async function patchHrLeaveRequest(leaveRequestId: number, payload: { action: "APPROVE" | "REJECT"; reason?: string }) {
  return apiFetch(`/admin/hr/leave-requests/${leaveRequestId}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function listHrExpenseClaims(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<{ count: number; results: HrExpenseClaim[] }>(`/admin/hr/expense-claims/${queryString(params)}`);
}

export async function patchHrExpenseClaim(expenseClaimId: number, payload: { action: "APPROVE" | "REJECT"; reason?: string }) {
  return apiFetch(`/admin/hr/expense-claims/${expenseClaimId}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function getHrPayroll(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<{ current_period: { id: number; code: string; status: string } | null; salary_sheets: HrPayrollSheet[] }>(`/admin/hr/payroll/${queryString(params)}`);
}

export async function listHrSalaryPayments(params: Record<string, string | number | undefined | null> = {}) {
  return apiFetch<{ count: number; results: HrSalaryPayment[] }>(`/admin/hr/salary-payments/${queryString(params)}`);
}

export async function setHrStaffStatus(staffId: number, action: "DEACTIVATE" | "REACTIVATE", reason?: string) {
  return apiFetch<HrStaff>(`/admin/hr/staff/${staffId}/status/`, { method: "POST", body: JSON.stringify({ action, reason }) });
}

export async function listHrStaffDocuments(params: number | Record<string, string | number | undefined | null> = {}) {
  const query = typeof params === "number" ? queryString({ employee: params }) : queryString(params);
  return apiFetch<{ count: number; results: HrStaffDocument[] }>(`/admin/hr/staff-documents/${query}`);
}

export async function createHrStaffDocument(payload: FormData) {
  return apiFetch<HrStaffDocument>("/admin/hr/staff-documents/", { method: "POST", body: payload });
}

export async function patchHrStaffDocument(documentId: number, payload: Record<string, unknown>) {
  return apiFetch<HrStaffDocument>(`/admin/hr/staff-documents/${documentId}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function reviewHrStaffDocument(
  documentId: number,
  action: "verify" | "reject",
  notes?: string,
) {
  return apiFetch<HrStaffDocument>(`/admin/hr/staff-documents/${documentId}/review/`, {
    method: "POST",
    body: JSON.stringify({ action, notes: notes ?? "" }),
  });
}

export function downloadHrStaffProfilePdf(staffId: number, fallbackFilename = "staff-profile.pdf") {
  return downloadAuthenticatedFile(`/admin/hr/staff/${staffId}/profile-pdf/`, fallbackFilename);
}

export function downloadHrSalaryAgreementPdf(staffId: number, fallbackFilename = "salary-agreement.pdf") {
  return downloadAuthenticatedFile(`/admin/hr/staff/${staffId}/salary-agreement-pdf/`, fallbackFilename);
}
