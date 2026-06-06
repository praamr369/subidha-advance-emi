import { request } from "@/services/api";

export type AccountingMappingAuditRow = {
  event_key: string;
  event_label: string;
  label?: string;
  module: string;
  source_model: string;
  supported: boolean;
  posting_enabled: boolean;
  posting_mode: string;
  debit_purpose?: string | null;
  credit_purpose?: string | null;
  debit_account_code?: string | null;
  credit_account_code?: string | null;
  debit_account_type?: string | null;
  credit_account_type?: string | null;
  debit_mapping_status: string;
  credit_mapping_status: string;
  finance_account_status: string;
  period_readiness: string;
  numbering_readiness: string;
  status: string;
  bridge_status?: string | null;
  can_seed: boolean;
  can_apply_mapping: boolean;
  can_post: boolean;
  blocker_code?: string | null;
  blocker_reason?: string | null;
  recommended_action?: string | null;
  setup_href?: string | null;
  details?: Record<string, unknown>;
};

export type AccountingMappingAuditPayload = {
  generated_at?: string | null;
  read_only: boolean;
  journal_entries_created: number;
  document_sequences_allocated: number;
  period_readiness?: Record<string, unknown>;
  year_end_impact: string;
  bridge_impact: string;
  summary: {
    total_events: number;
    ready: number;
    missing_mapping: number;
    conflicts: number;
    unsupported: number;
    blocked_by_period: number;
    blocked_by_numbering: number;
  };
  events: AccountingMappingAuditRow[];
  ready_mappings: AccountingMappingAuditRow[];
  missing_mappings: AccountingMappingAuditRow[];
  conflicts: AccountingMappingAuditRow[];
  unsupported_events: AccountingMappingAuditRow[];
  setup_blockers: AccountingMappingAuditRow[];
};

export type AccountingMappingAuditSeedResponse = {
  before: AccountingMappingAuditPayload;
  after: AccountingMappingAuditPayload;
  journal_entries_created: number;
  document_sequences_allocated: number;
};

export async function getAccountingMappingAudit(): Promise<AccountingMappingAuditPayload> {
  return request<AccountingMappingAuditPayload>("/admin/accounting/mapping-audit/");
}

export async function seedAccountingMappingSafeDefaults(): Promise<AccountingMappingAuditSeedResponse> {
  return request<AccountingMappingAuditSeedResponse>("/admin/accounting/mapping-audit/seed-safe-defaults/", {
    method: "POST",
    body: JSON.stringify({}),
    retryCount: 0,
  });
}

export async function validateAccountingMappingAudit(): Promise<AccountingMappingAuditPayload> {
  return request<AccountingMappingAuditPayload>("/admin/accounting/mapping-audit/validate/", {
    method: "POST",
    body: JSON.stringify({}),
    retryCount: 0,
  });
}

export async function fixAccountingMappingAuditEvent(input: { event_key: string; action: "create_account" | "apply_mapping" | "reactivate_mapping" | "open_manual_required"; purpose?: string | null }): Promise<{ audit: AccountingMappingAuditPayload }> {
  return request<{ audit: AccountingMappingAuditPayload }>("/admin/accounting/mapping-audit/fix-event/", {
    method: "POST",
    body: JSON.stringify(input),
    retryCount: 0,
  });
}
