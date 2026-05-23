import { apiFetch } from "@/lib/api";
import type {
  BankStatementImport,
  BankStatementLine,
  UpiSettlementImport,
  UpiSettlementLine,
  SettlementAllocation,
  CashierDayClose,
  CashierDayClosePreviewResponse,
  PaginatedResponse,
  BankImportCreatePayload,
  UpiImportCreatePayload,
  SettlementAllocationCreatePayload,
  SettlementAllocationVoidPayload,
  CashierDayCloseCreatePayload,
  CashierDayCloseApprovalPayload,
  CashierDayCloseRejectPayload,
} from "@/types/settlements";

// Helper to build query string for optional params
type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

function buildQuery(params: QueryParams = {}): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

// Bank Imports
export async function listBankImports(params?: QueryParams) {
  return apiFetch<PaginatedResponse<BankStatementImport>>(
    `/admin/settlements/bank-imports/${buildQuery(params)}`
  );
}

export async function createBankImport(payload: BankImportCreatePayload) {
  const form = new FormData();
  form.append("bank_finance_account", String(payload.bank_finance_account));
  form.append("statement_period_from", payload.statement_period_from);
  form.append("statement_period_to", payload.statement_period_to);
  form.append("uploaded_file", payload.uploaded_file);
  return apiFetch<BankStatementImport>("/admin/settlements/bank-imports/", {
    method: "POST",
    body: form,
  });
}

export async function getBankImport(id: number | string) {
  return apiFetch<BankStatementImport>(`/admin/settlements/bank-imports/${id}/`);
}

export async function listBankImportLines(
  importId: number | string,
  params?: QueryParams
) {
  return apiFetch<PaginatedResponse<BankStatementLine>>(
    `/admin/settlements/bank-imports/${importId}/lines/${buildQuery(params)}`
  );
}

// UPI Imports
export async function listUpiImports(params?: QueryParams) {
  return apiFetch<PaginatedResponse<UpiSettlementImport>>(
    `/admin/settlements/upi-imports/${buildQuery(params)}`
  );
}

export async function createUpiImport(payload: UpiImportCreatePayload) {
  const form = new FormData();
  form.append("upi_finance_account", String(payload.upi_finance_account));
  form.append("settlement_date", payload.settlement_date);
  form.append("uploaded_file", payload.uploaded_file);
  return apiFetch<UpiSettlementImport>("/admin/settlements/upi-imports/", {
    method: "POST",
    body: form,
  });
}

export async function getUpiImport(id: number | string) {
  return apiFetch<UpiSettlementImport>(`/admin/settlements/upi-imports/${id}/`);
}

export async function listUpiImportLines(
  importId: number | string,
  params?: QueryParams
) {
  return apiFetch<PaginatedResponse<UpiSettlementLine>>(
    `/admin/settlements/upi-imports/${importId}/lines/${buildQuery(params)}`
  );
}

// Allocations
export async function listAllocations(params?: QueryParams) {
  return apiFetch<PaginatedResponse<SettlementAllocation>>(
    `/admin/settlements/allocations/${buildQuery(params)}`
  );
}

export async function createAllocation(payload: SettlementAllocationCreatePayload) {
  return apiFetch<SettlementAllocation>("/admin/settlements/allocations/", {
    method: "POST",
    body: payload,
  });
}

export async function getAllocation(id: number | string) {
  return apiFetch<SettlementAllocation>(`/admin/settlements/allocations/${id}/`);
}

export async function voidAllocation(
  id: number | string,
  payload: SettlementAllocationVoidPayload = {}
) {
  return apiFetch<SettlementAllocation>(`/admin/settlements/allocations/${id}/void/`, {
    method: "POST",
    body: payload,
  });
}

// === Cashier day-close (evidence only) ===

export async function previewCashierDayClose(params?: {
  business_date?: string;
  branch_id?: number | null;
  cash_counter_id?: number | null;
  finance_account_id?: number | null;
}) {
  return apiFetch<CashierDayClosePreviewResponse>(
    `/cashier/day-close/preview/${buildQuery(params)}`
  );
}

export async function getCashierCurrentDayClose(params?: {
  cash_counter_id?: number | null;
}) {
  return apiFetch<CashierDayClose>(`/cashier/day-close/current/${buildQuery(params)}`);
}

export async function listCashierDayCloses(params?: QueryParams) {
  return apiFetch<PaginatedResponse<CashierDayClose>>(
    `/cashier/day-close/${buildQuery(params)}`
  );
}

export async function createCashierDayClose(payload: CashierDayCloseCreatePayload) {
  return apiFetch<CashierDayClose>("/cashier/day-close/", {
    method: "POST",
    body: payload,
  });
}

export async function getCashierDayClose(id: number | string) {
  return apiFetch<CashierDayClose>(`/cashier/day-close/${id}/`);
}

export async function submitCashierDayClose(id: number | string) {
  return apiFetch<CashierDayClose>(`/cashier/day-close/${id}/submit/`, {
    method: "POST",
    body: {},
  });
}

// === Admin day-close review (evidence only) ===

export async function listAdminCashierDayCloses(params?: QueryParams) {
  return apiFetch<PaginatedResponse<CashierDayClose>>(
    `/admin/settlements/cashier-day-closes/${buildQuery(params)}`
  );
}

export async function getAdminCashierDayClose(id: number | string) {
  return apiFetch<CashierDayClose>(
    `/admin/settlements/cashier-day-closes/${id}/`
  );
}

export async function approveAdminCashierDayClose(
  id: number | string,
  payload: CashierDayCloseApprovalPayload = {}
) {
  return apiFetch<CashierDayClose>(
    `/admin/settlements/cashier-day-closes/${id}/approve/`,
    { method: "POST", body: payload }
  );
}

export async function rejectAdminCashierDayClose(
  id: number | string,
  payload: CashierDayCloseRejectPayload
) {
  return apiFetch<CashierDayClose>(
    `/admin/settlements/cashier-day-closes/${id}/reject/`,
    { method: "POST", body: payload }
  );
}
