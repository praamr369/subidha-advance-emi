import { apiFetch } from "@/lib/api";

export type AccountingReadiness = {
  status: string;
  reason?: string;
  source_collection_enabled: boolean;
  accounting_bridge_enabled: boolean;
  collection_ready?: boolean;
  mapping_ready?: boolean;
  posting_bridge_ready?: boolean;
  posting_bridge_approved?: boolean;
  posting_mode?: "AUDIT_DEFERRED" | "POSTING_ENABLED" | "MANUAL_APPROVAL_REQUIRED" | string;
  message?: string | null;
  operator_action?: string | null;
  blockers: string[];
  field_errors?: Record<string, string[]>;
  mapping?: Record<string, unknown> | null;
  counters?: Record<string, number>;
  posting_bridge_config?: RentLeasePostingBridgeConfig;
};

export type RentLeasePostingBridgeConfig = {
  id: number;
  is_enabled: boolean;
  enabled_at: string | null;
  enabled_by_id: number | null;
  disabled_at: string | null;
  disabled_by_id: number | null;
  reason: string;
  last_readiness_snapshot: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

export type RentLeasePostingBridgeConfigResponse = {
  detail?: string;
  config: RentLeasePostingBridgeConfig;
  readiness: AccountingReadiness;
};

export type RentLeasePostingBridgeApprovalInput = {
  reason: string;
  confirmation: string;
};

export type AccountMappingResponse = {
  mapping: Record<string, unknown> | null;
  readiness: AccountingReadiness;
  chart_accounts: Array<{ id: number; code: string; name: string; account_type: string }>;
  finance_accounts: Array<{ id: number; name: string; kind: string; chart_account_id?: number; chart_account_type?: string }>;
  guidance: Record<string, string>;
};

export type BridgePostingLine = {
  account: { id: number; code: string; name: string; account_type: string };
  description: string;
  debit: string;
  credit: string;
};

export type BridgePostingPreview = {
  source_model: string;
  source_id: string;
  source_reference: string;
  event_type: string;
  amount: string;
  status: string;
  postable: boolean;
  blocked_reason: string;
  idempotency_key: string;
  debit_total: string;
  credit_total: string;
  lines: BridgePostingLine[];
  duplicate_posting_protection: string;
};

export type BridgePostingExecuteResponse = {
  detail: string;
  status: string;
  posting_id?: number | null;
  journal_entry_id?: number | null;
  journal_entry_no?: string | null;
  posted_at?: string | null;
  preview: BridgePostingPreview;
};

function postPreview(path: string) {
  return apiFetch<BridgePostingPreview>(path, { method: "POST" });
}

function postExecute(path: string) {
  return apiFetch<BridgePostingExecuteResponse>(path, { method: "POST" });
}

export function getAccountingReadiness() {
  return apiFetch<AccountingReadiness>("/admin/accounting/readiness/");
}

export function getAdminRentLeaseAccountMappingBridge() {
  return apiFetch<AccountMappingResponse>("/admin/finance/account-mapping/");
}

export function saveAdminRentLeaseAccountMappingBridge(input: Record<string, unknown>) {
  return apiFetch<{ detail: string; mapping_id: number; readiness: AccountingReadiness }>("/admin/finance/account-mapping/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getRentLeaseAccountingSummary() {
  return apiFetch<{
    readiness: AccountingReadiness;
    demand_records: number;
    monthly_collected_sources: number;
    deposit_collected_sources: number;
    posting_bridge: Record<string, number>;
    not_used: { lucky_ids: boolean; draws: boolean };
  }>("/admin/rent-lease/accounting-summary/");
}

export function getRentLeasePostingBridgeConfig() {
  return apiFetch<RentLeasePostingBridgeConfigResponse>("/admin/rent-lease/accounting-bridge/config/");
}

export function enableRentLeasePostingBridge(input: RentLeasePostingBridgeApprovalInput) {
  return apiFetch<RentLeasePostingBridgeConfigResponse>("/admin/rent-lease/accounting-bridge/enable/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function disableRentLeasePostingBridge(input: RentLeasePostingBridgeApprovalInput) {
  return apiFetch<RentLeasePostingBridgeConfigResponse>("/admin/rent-lease/accounting-bridge/disable/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function previewDepositPosting(id: number | string) {
  return postPreview(`/admin/finance/deposits/${id}/posting-preview/`);
}

export function executeDepositPosting(id: number | string) {
  return postExecute(`/admin/finance/deposits/${id}/posting-execute/`);
}

export function previewDepositRefundPosting(id: number | string) {
  return postPreview(`/admin/finance/deposits/${id}/refund-posting-preview/`);
}

export function executeDepositRefundPosting(id: number | string) {
  return postExecute(`/admin/finance/deposits/${id}/refund-posting-execute/`);
}

export function previewDepositDamagePosting(id: number | string) {
  return postPreview(`/admin/finance/deposits/${id}/damage-posting-preview/`);
}

export function executeDepositDamagePosting(id: number | string) {
  return postExecute(`/admin/finance/deposits/${id}/damage-posting-execute/`);
}

export function previewRentLeaseDemandPosting(id: number | string) {
  return postPreview(`/admin/rent-lease/demands/${id}/posting-preview/`);
}

export function executeRentLeaseDemandPosting(id: number | string) {
  return postExecute(`/admin/rent-lease/demands/${id}/posting-execute/`);
}

export function listCustomerAdvances() {
  return apiFetch<{ count: number; results: Array<Record<string, unknown>> }>("/admin/customer-advances/");
}

export function createCustomerAdvance(input: Record<string, unknown>) {
  return apiFetch<Record<string, unknown>>("/admin/customer-advances/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function previewCustomerAdvancePosting(id: number | string) {
  return postPreview(`/admin/customer-advances/${id}/posting-preview/`);
}

export function executeCustomerAdvancePosting(id: number | string) {
  return postExecute(`/admin/customer-advances/${id}/posting-execute/`);
}
