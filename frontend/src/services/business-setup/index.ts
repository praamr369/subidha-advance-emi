import { ApiError, apiFetch, toArray } from "@/lib/api";

export type BusinessProfile = {
  id?: number;
  legal_name: string;
  trade_name?: string;
  business_code?: string;
  primary_email?: string;
  primary_phone?: string;
  alternate_phone?: string;
  website_url?: string;
  address_line_1?: string;
  address_line_2?: string;
  landmark?: string;
  city?: string;
  district?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  gstin?: string;
  pan_number?: string;
  invoice_prefix?: string;
  receipt_prefix?: string;
  default_currency_code?: string;
  timezone_name?: string;
  logo_url?: string;
  is_active?: boolean;
};

export type BranchRecord = {
  id: number;
  code: string;
  name: string;
  branch_type: string;
  email?: string;
  phone?: string;
  manager_name?: string;
  address_line_1?: string;
  address_line_2?: string;
  landmark?: string;
  city?: string;
  district?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  is_head_office: boolean;
  is_active: boolean;
  opened_on?: string | null;
  notes?: string;
};

export type FinanceAccountRecord = {
  id: number;
  code: string;
  name: string;
  account_type: string;
  account_holder_name?: string;
  provider_name?: string;
  bank_name?: string;
  branch_name?: string;
  masked_account_number?: string;
  ifsc_code?: string;
  upi_handle?: string;
  notes?: string;
  is_active: boolean;
};

export type CashDeskRecord = {
  id: number;
  code: string;
  name: string;
  branch: number;
  branch_name?: string;
  desk_type: string;
  default_finance_account: number;
  default_finance_account_name?: string;
  allow_cash_collection: boolean;
  allow_bank_collection: boolean;
  allow_upi_collection: boolean;
  receipt_printer_name?: string;
  device_label?: string;
  is_default_for_branch: boolean;
  is_active: boolean;
  notes?: string;
};

export type StaffOperationalAssignmentRecord = {
  id: number;
  user: number;
  username?: string;
  role_scope: string;
  branch: number;
  branch_name?: string;
  default_cash_desk?: number | null;
  default_cash_desk_name?: string;
  can_collect_payments: boolean;
  can_verify_payments: boolean;
  can_manage_branches: boolean;
  can_manage_cash_desks: boolean;
  can_manage_finance_accounts: boolean;
  can_manage_chart_accounts: boolean;
  can_run_go_live_reset: boolean;
  is_primary: boolean;
  is_active: boolean;
  effective_from: string;
  effective_to?: string | null;
};

export type ChartAccountRecord = {
  id: number;
  code: string;
  name: string;
  account_category: string;
  account_group: string;
  parent?: number | null;
  parent_name?: string;
  description?: string;
  is_system: boolean;
  is_active: boolean;
  allow_manual_posting: boolean;
  display_order: number;
};

export type SetupChecklistItem = {
  key: string;
  label: string;
  status: string;
  detail: string;
  route?: string;
};

export type SetupChecklist = {
  is_ready_for_go_live: boolean;
  percent_complete: number;
  items: SetupChecklistItem[];
};

export async function getBusinessProfile(): Promise<BusinessProfile | null> {
  try {
    return await apiFetch<BusinessProfile>("/admin/business-profile/");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function saveBusinessProfile(payload: Partial<BusinessProfile>): Promise<BusinessProfile> {
  return apiFetch<BusinessProfile>("/admin/business-profile/", {
    method: "PATCH",
    body: payload,
  });
}

export async function listBranches(): Promise<BranchRecord[]> {
  const response = await apiFetch<unknown>("/admin/branches/");
  return toArray<BranchRecord>(response);
}

export async function createBranch(payload: Partial<BranchRecord>): Promise<BranchRecord> {
  return apiFetch<BranchRecord>("/admin/branches/", { method: "POST", body: payload });
}

export async function updateBranch(id: number, payload: Partial<BranchRecord>): Promise<BranchRecord> {
  return apiFetch<BranchRecord>(`/admin/branches/${id}/`, { method: "PATCH", body: payload });
}

export async function listFinanceAccounts(): Promise<FinanceAccountRecord[]> {
  const response = await apiFetch<unknown>("/admin/finance-accounts/");
  return toArray<FinanceAccountRecord>(response);
}

export async function createFinanceAccount(payload: Partial<FinanceAccountRecord>): Promise<FinanceAccountRecord> {
  return apiFetch<FinanceAccountRecord>("/admin/finance-accounts/", { method: "POST", body: payload });
}

export async function updateFinanceAccount(id: number, payload: Partial<FinanceAccountRecord>): Promise<FinanceAccountRecord> {
  return apiFetch<FinanceAccountRecord>(`/admin/finance-accounts/${id}/`, { method: "PATCH", body: payload });
}

export async function listCashDesks(): Promise<CashDeskRecord[]> {
  const response = await apiFetch<unknown>("/admin/cash-desks/");
  return toArray<CashDeskRecord>(response);
}

export async function createCashDesk(payload: Partial<CashDeskRecord>): Promise<CashDeskRecord> {
  return apiFetch<CashDeskRecord>("/admin/cash-desks/", { method: "POST", body: payload });
}

export async function updateCashDesk(id: number, payload: Partial<CashDeskRecord>): Promise<CashDeskRecord> {
  return apiFetch<CashDeskRecord>(`/admin/cash-desks/${id}/`, { method: "PATCH", body: payload });
}

export async function listStaffAssignments(): Promise<StaffOperationalAssignmentRecord[]> {
  const response = await apiFetch<unknown>("/admin/staff-operational-assignments/");
  return toArray<StaffOperationalAssignmentRecord>(response);
}

export async function createStaffAssignment(payload: Partial<StaffOperationalAssignmentRecord>): Promise<StaffOperationalAssignmentRecord> {
  return apiFetch<StaffOperationalAssignmentRecord>("/admin/staff-operational-assignments/", { method: "POST", body: payload });
}

export async function updateStaffAssignment(id: number, payload: Partial<StaffOperationalAssignmentRecord>): Promise<StaffOperationalAssignmentRecord> {
  return apiFetch<StaffOperationalAssignmentRecord>(`/admin/staff-operational-assignments/${id}/`, { method: "PATCH", body: payload });
}

export async function listChartAccounts(): Promise<ChartAccountRecord[]> {
  const response = await apiFetch<unknown>("/admin/chart-accounts/");
  return toArray<ChartAccountRecord>(response);
}

export async function createChartAccount(payload: Partial<ChartAccountRecord>): Promise<ChartAccountRecord> {
  return apiFetch<ChartAccountRecord>("/admin/chart-accounts/", { method: "POST", body: payload });
}

export async function updateChartAccount(id: number, payload: Partial<ChartAccountRecord>): Promise<ChartAccountRecord> {
  return apiFetch<ChartAccountRecord>(`/admin/chart-accounts/${id}/`, { method: "PATCH", body: payload });
}

export async function getSetupChecklist(): Promise<SetupChecklist> {
  return apiFetch<SetupChecklist>("/admin/business-setup/checklist/");
}

export async function getResetPreview(): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>("/admin/business-setup/reset-preview/");
}
