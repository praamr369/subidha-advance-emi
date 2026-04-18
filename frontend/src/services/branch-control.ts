import { apiFetch } from "@/lib/api";

type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type QueryValue = string | number | undefined | null;

function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type BranchStatus = "ACTIVE" | "INACTIVE";

export type BranchRecord = {
  id: number;
  code: string;
  name: string;
  status: BranchStatus;
  is_primary: boolean;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
};

export type CashCounterRecord = {
  id: number;
  code: string;
  name: string;
  branch: number;
  branch_code?: string;
  branch_name?: string;
  finance_account: number;
  finance_account_name?: string;
  assigned_user?: number | null;
  assigned_user_username?: string | null;
  is_active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
};

export type BranchReportingOverview = {
  branch?: {
    id: number;
    code: string;
    name: string;
    status: BranchStatus;
    is_primary: boolean;
  } | null;
  branches: Array<{
    id: number;
    code: string;
    name: string;
    status: BranchStatus;
    is_primary: boolean;
  }>;
  filters: {
    branch_id?: number | null;
    start_date?: string | null;
    end_date?: string | null;
  };
  collections: {
    count: number;
    gross_amount: string;
    active_count?: number;
    reversed_count?: number;
    reversed_amount?: string;
    net_amount?: string;
    cash_total: string;
    bank_total: string;
    upi_total: string;
    cash_net_total?: string;
    bank_net_total?: string;
    upi_net_total?: string;
  };
  direct_sales: {
    count: number;
    gross_total: string;
  };
  subscriptions: {
    active_contracts: number;
    completed_contracts: number;
    overdue_emi_count: number;
    overdue_emi_amount: string;
  };
  stock: {
    location_count: number;
    movement_count: number;
    on_hand_qty: string;
  };
  people_costs: {
    salary_paid_total: string;
    expense_total: string;
    reimbursement_total: string;
  };
};

export type BranchPayload = {
  code: string;
  name: string;
  status: BranchStatus;
  is_primary?: boolean;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
};

export type CashCounterPayload = {
  code: string;
  name: string;
  branch: number;
  finance_account: number;
  assigned_user?: number | null;
  is_active?: boolean;
  notes?: string;
};

export function listBranches(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<BranchRecord>>(`/branch-control/branches/${buildQuery(params)}`);
}

export function createBranch(payload: BranchPayload) {
  return apiFetch<BranchRecord>("/branch-control/branches/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateBranch(id: number | string, payload: Partial<BranchPayload>) {
  return apiFetch<BranchRecord>(`/branch-control/branches/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function listCashCounters(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<CashCounterRecord>>(`/branch-control/counters/${buildQuery(params)}`);
}

export function createCashCounter(payload: CashCounterPayload) {
  return apiFetch<CashCounterRecord>("/branch-control/counters/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCashCounter(id: number | string, payload: Partial<CashCounterPayload>) {
  return apiFetch<CashCounterRecord>(`/branch-control/counters/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getBranchReportingOverview(params: Record<string, QueryValue> = {}) {
  return apiFetch<BranchReportingOverview>(`/branch-control/reporting/overview/${buildQuery(params)}`);
}
