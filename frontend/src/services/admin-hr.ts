import { apiFetch } from "@/lib/api";

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
  joining_date: string;
  base_salary?: string | null;
  is_active: boolean;
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

export async function getHrSummary() {
  return apiFetch<HrSummary>("/admin/hr/summary/");
}

export async function listHrStaff() {
  return apiFetch<{ count: number; results: HrStaff[] }>("/admin/hr/staff/");
}

export async function createHrStaff(payload: {
  name: string;
  phone: string;
  email?: string;
  role?: "ADMIN" | "CASHIER";
  branch?: number | null;
  cash_counter?: number | null;
  joining_date?: string | null;
  is_active?: boolean;
  base_salary?: string | null;
  notes?: string;
}) {
  return apiFetch("/admin/hr/staff/", { method: "POST", body: JSON.stringify(payload) });
}

export async function patchHrStaff(staffId: number, payload: Record<string, unknown>) {
  return apiFetch(`/admin/hr/staff/${staffId}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function listHrAttendance(params = "") {
  return apiFetch<{ count: number; results: HrAttendance[] }>(`/admin/hr/attendance/${params ? `?${params}` : ""}`);
}

export async function markHrAttendance(payload: {
  employee: number;
  attendance_date?: string;
  status: string;
  notes?: string;
  worked_hours?: string | null;
  overtime_hours?: string | null;
}) {
  return apiFetch("/admin/hr/attendance/", { method: "POST", body: JSON.stringify(payload) });
}

export async function listHrLeaveRequests() {
  return apiFetch<{ count: number; results: HrLeaveRequest[] }>("/admin/hr/leave-requests/");
}

export async function patchHrLeaveRequest(leaveRequestId: number, payload: { action: "APPROVE" | "REJECT"; reason?: string }) {
  return apiFetch(`/admin/hr/leave-requests/${leaveRequestId}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function listHrExpenseClaims() {
  return apiFetch<{ count: number; results: HrExpenseClaim[] }>("/admin/hr/expense-claims/");
}

export async function patchHrExpenseClaim(expenseClaimId: number, payload: { action: "APPROVE" | "REJECT"; reason?: string }) {
  return apiFetch(`/admin/hr/expense-claims/${expenseClaimId}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function getHrPayroll() {
  return apiFetch<{ current_period: { id: number; code: string; status: string } | null; salary_sheets: unknown[] }>("/admin/hr/payroll/");
}

export async function listHrSalaryPayments() {
  return apiFetch<{ count: number; results: unknown[] }>("/admin/hr/salary-payments/");
}

