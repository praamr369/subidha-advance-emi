import { request } from "@/services/api";

export type StaffUser = {
  id: number;
  username: string;
  role: string;
  phone?: string;
  email?: string;
  display_name?: string;
  staff_profile_id?: number;
  login_enabled?: boolean;
};

export type StaffProfile = {
  id: number;
  employee_code: string;
  name: string;
  phone?: string;
  designation?: string;
  department?: string;
  joining_date?: string;
  base_salary?: string | null;
  employment_type?: string;
  branch_name?: string;
  is_active?: boolean;
};

export type StaffProfilePayload = {
  user: StaffUser;
  profile: StaffProfile;
  crm_party?: { party_id: number; party_no: string; display_name: string } | null;
};

export type StaffAttendanceRow = {
  id: number;
  attendance_date: string;
  status: string;
  worked_hours?: string;
  overtime_hours?: string;
  notes?: string;
};

export type StaffAttendancePayload = {
  today: StaffAttendanceRow | null;
  counts: Record<string, number>;
  results: StaffAttendanceRow[];
};

export type StaffPayslip = {
  id: number;
  year: number;
  month: number;
  gross_amount: string;
  deductions_amount: string;
  net_amount: string;
  status: string;
  payment_total?: string;
  outstanding_amount?: string;
  payroll_period_code?: string;
  lines?: Array<{ id: number; component_name: string; component_type: string; amount: string }>;
};

export type StaffSalarySummary = {
  base_salary: string;
  employment_type: string;
  salary_effective_from?: string | null;
  latest_payslip: StaffPayslip | null;
  recent_payslips: StaffPayslip[];
  salary_payment_count: number;
};

export type StaffDashboardPayload = {
  profile: StaffProfilePayload;
  today_attendance: StaffAttendanceRow | null;
  salary_summary: StaffSalarySummary;
  reports: Record<string, number>;
  latest_payslip_id?: number | null;
};

export type StaffReportsPayload = {
  employee_id: number;
  attendance_count: number;
  payslip_count: number;
  salary_payment_count: number;
  salary_paid_amount: string;
  read_only: boolean;
};

export type StaffTaskPayload = {
  results: unknown[];
  detail: string;
  read_only: boolean;
};

export type AdminStaffIdentity = {
  id: number;
  user_id: number;
  username: string;
  employee: number;
  employee_name: string;
  employee_code: string;
  login_enabled: boolean;
  temporary_password_last_set_at?: string | null;
  temporary_password?: string | null;
};

export type AdminStaffCreateInput = {
  employee?: number;
  name: string;
  phone: string;
  email?: string;
  username: string;
  temporary_password?: string;
  designation?: string;
  department?: string;
  branch?: number | null;
  joining_date: string;
  base_salary?: string | null;
  login_enabled?: boolean;
};

export function getStaffDashboard() {
  return request<StaffDashboardPayload>("/staff/dashboard/");
}

export function getStaffProfile() {
  return request<StaffProfilePayload>("/staff/profile/");
}

export function getStaffAttendance(params?: { year?: number; month?: number }) {
  const search = new URLSearchParams();
  if (params?.year) search.set("year", String(params.year));
  if (params?.month) search.set("month", String(params.month));
  const qs = search.toString();
  return request<StaffAttendancePayload>(`/staff/attendance/${qs ? `?${qs}` : ""}`);
}

export function getStaffPayslips() {
  return request<{ results: StaffPayslip[] }>("/staff/payslips/");
}

export function getStaffPayslip(id: number) {
  return request<StaffPayslip>(`/staff/payslips/${id}/`);
}

export function getStaffSalarySummary() {
  return request<StaffSalarySummary>("/staff/salary-summary/");
}

export function getStaffReports() {
  return request<StaffReportsPayload>("/staff/reports/");
}

export function getStaffTasks() {
  return request<StaffTaskPayload>("/staff/tasks/");
}

export function listAdminStaffIdentities() {
  return request<{ results: AdminStaffIdentity[] }>("/admin/staff-identities/");
}

export function createAdminStaffIdentity(input: AdminStaffCreateInput) {
  return request<AdminStaffIdentity>("/admin/staff-identities/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAdminStaffLogin(id: number, login_enabled: boolean) {
  return request<AdminStaffIdentity>(`/admin/staff-identities/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ login_enabled }),
  });
}
