import { request } from "@/services/api";

export type AccountingMappingRemediationRow = {
  event_type: string;
  event_key: string;
  source_model: string;
  module: string;
  status: string;
  reason: string;
  recommended_action: string;
  action_type: string;
  action_label: string;
  action_href: string;
  setup_route?: string;
  can_auto_create_account: boolean;
  can_apply_mapping?: boolean;
  can_map_account: boolean;
  can_post: boolean;
  is_supported: boolean;
  is_acknowledgeable: boolean;
  required_account_type: string | null;
  required_account_code: string | null;
  required_account_name: string | null;
  required_account_system_code?: string | null;
  existing_account_id?: number | null;
  existing_account_code?: string | null;
  existing_account_name?: string | null;
  mapping_id?: number | null;
  mapping_profile_key?: string | null;
};

export type AccountingMappingRemediationPayload = {
  generated_at: string;
  read_only: boolean;
  journal_entries_created: number;
  document_sequences_allocated: number;
  rows: AccountingMappingRemediationRow[];
  results: AccountingMappingRemediationRow[];
  actions?: Record<string, string>;
  summary: {
    total: number;
    ready: number;
    missing_account: number;
    unmapped: number;
    blocked?: number;
    unsupported: number;
  };
};

export type AccountingMappingSeedResponse = {
  selected_event?: string | null;
  defaults?: Record<string, unknown>;
  special_results?: unknown[];
  journal_entries_created: number;
  document_sequences_allocated: number;
  readiness: AccountingMappingRemediationPayload;
};

export async function getAccountingMappingRemediation(): Promise<AccountingMappingRemediationPayload> {
  return request<AccountingMappingRemediationPayload>("/admin/accounting/mapping-remediation/");
}

export async function createAccountingMappingRemediationAccount(eventType: string): Promise<{ readiness: AccountingMappingRemediationPayload }> {
  return request<{ readiness: AccountingMappingRemediationPayload }>("/admin/accounting/mapping-remediation/create-account/", {
    method: "POST",
    body: JSON.stringify({ event_type: eventType }),
    retryCount: 0,
  });
}

export async function applyAccountingMappingRemediation(eventType: string, accountId?: number | null): Promise<{ readiness: AccountingMappingRemediationPayload }> {
  return request<{ readiness: AccountingMappingRemediationPayload }>("/admin/accounting/mapping-remediation/apply/", {
    method: "POST",
    body: JSON.stringify({ event_type: eventType, account_id: accountId ?? null }),
    retryCount: 0,
  });
}

export async function seedSupportedAccountingMappings(): Promise<AccountingMappingSeedResponse> {
  return request<AccountingMappingSeedResponse>("/admin/accounting/mapping-remediation/seed-supported-defaults/", {
    method: "POST",
    body: JSON.stringify({}),
    retryCount: 0,
  });
}

export async function acknowledgeAccountingMappingRemediation(eventType: string): Promise<{ readiness: AccountingMappingRemediationPayload }> {
  return request<{ readiness: AccountingMappingRemediationPayload }>("/admin/accounting/mapping-remediation/acknowledge/", {
    method: "POST",
    body: JSON.stringify({ event_type: eventType }),
    retryCount: 0,
  });
}
