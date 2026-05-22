import { apiFetch } from "@/lib/api";
import type {
  BankStatementImport,
  BankStatementLine,
  UpiSettlementImport,
  UpiSettlementLine,
  SettlementAllocation,
  PaginatedResponse,
  BankImportCreatePayload,
  UpiImportCreatePayload,
  SettlementAllocationCreatePayload,
  SettlementAllocationVoidPayload,
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
