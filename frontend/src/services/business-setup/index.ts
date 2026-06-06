import { ApiError, apiFetch } from "@/lib/api";

export type DocumentPrintSettings = {
  id?: number;
  business_profile?: number | null;
  business_logo?: string | null;
  business_logo_url?: string;
  business_name?: string;
  business_tagline?: string;
  print_address?: string;
  print_phone?: string;
  print_email?: string;
  print_website?: string;
  tax_label?: string;
  invoice_terms?: string;
  receipt_terms?: string;
  delivery_challan_terms?: string;
  subscription_contract_terms?: string;
  rent_lease_contract_terms?: string;
  purchase_bill_terms?: string;
  vendor_voucher_terms?: string;
  account_statement_terms?: string;
  report_footer_note?: string;
  authorized_signatory_label?: string;
  customer_signature_label?: string;
  document_layout_density?: "COMFORTABLE" | "COMPACT" | string;
  show_watermark?: boolean;
  show_logo?: boolean;
  is_active?: boolean;
  clear_logo?: boolean;
};

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
  document_print_settings?: DocumentPrintSettings;
};

export type SetupChecklistItem = {
  key: string;
  label: string;
  level?: "required" | "recommended" | "optional" | string;
  status: string;
  detail: string;
  route?: string;
};

export type SetupChecklist = {
  is_ready_for_go_live: boolean;
  percent_complete: number;
  items: SetupChecklistItem[];
  counts?: Record<string, unknown>;
};

export type SetupReadinessStatus = "READY" | "NEEDS_SETUP" | "BLOCKED" | string;

export type SetupReadinessSection = {
  key: string;
  title: string;
  status: SetupReadinessStatus;
  blockers: string[];
  warnings: string[];
  recommended_action: string;
  target_route: string;
  why_this_matters: string;
  metadata?: Record<string, unknown>;
};

export type SetupReadinessFinanceAccount = {
  id: number;
  name: string;
  kind: string;
  branch?: string | null;
  mapped_chart_account?: {
    id: number;
    code: string;
    name: string;
    account_type: string;
    allow_manual_posting?: boolean;
    is_active?: boolean;
  } | null;
  posting_ready: boolean;
  collection_ready: boolean;
  blocker_reason?: string | null;
  recommended_action?: string | null;
};

export type SetupLaunchChecklistItem = {
  key: string;
  label: string;
  ready: boolean;
  source_section: string;
};

export type SetupReadinessPayload = {
  summary: {
    overall_status: SetupReadinessStatus;
    ready_count: number;
    warning_count: number;
    blocker_count: number;
    next_recommended_action?: string;
    next_target_route?: string;
  };
  sections: SetupReadinessSection[];
  finance_accounts: SetupReadinessFinanceAccount[];
  launch_checklist: SetupLaunchChecklistItem[];
  read_only?: boolean;
  mutation_policy?: string;
};

export type DocumentNumberingSequence = {
  key: string;
  name: string;
  series_code: string;
  document_type?: string;
  financial_year: string;
  active_financial_year_code?: string;
  financial_year_ref?: number | null;
  financial_year_name?: string;
  financial_year_date_range?: {
    start_date?: string;
    end_date?: string;
  };
  workflow_group?: string;
  doc_kind?: "invoice" | string;
  description?: string;
  required_for_go_live?: boolean;
  configured: boolean;
  prefix: string;
  pattern?: string;
  suffix?: string;
  reset_policy?: "NEVER" | "YEARLY" | "MONTHLY" | string;
  next_number: number;
  padding: number;
  preview_number?: string | null;
  next_number_preview: string | null;
  last_issued_number: string | null;
  issued_count?: number;
  max_issued_number?: number;
  min_safe_next_number?: number;
  duplicate_count?: number;
  inactive_duplicate_count?: number;
  setup_blockers?: string[];
  status: "ready" | "needs_setup" | "duplicate_risk" | "blocked" | string;
  warnings?: string[];
  blockers?: string[];
  can_edit_prefix?: boolean;
  can_edit_next_number?: boolean;
  can_seed_default?: boolean;
  default_prefix?: string;
  default_pattern?: string;
  default_padding?: number;
};

export type DocumentNumberingState = {
  financial_year: string;
  active_financial_year?: {
    id?: number;
    code?: string;
    name?: string;
    start_date?: string;
    end_date?: string;
  } | null;
  active_financial_year_code?: string;
  active_financial_year_date_range?: {
    start_date?: string;
    end_date?: string;
  };
  current_period?: {
    id?: number;
    code?: string;
    name?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
    is_locked?: boolean;
  } | null;
  sequences: DocumentNumberingSequence[];
  missing_required_profiles?: string[];
  inactive_duplicate_profiles?: Record<string, number>;
  duplicate_issued_number_warnings?: Record<string, number>;
  setup_blockers?: string[];
  checks: Record<string, boolean>;
  summary?: Record<string, number>;
  duplicate_issues: Record<string, number>;
  operator_rules?: string[];
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

export async function getDocumentPrintSettings(): Promise<DocumentPrintSettings> {
  return apiFetch<DocumentPrintSettings>("/admin/business-profile/?section=document-print-settings");
}

export async function saveDocumentPrintSettings(payload: Partial<DocumentPrintSettings> | FormData): Promise<DocumentPrintSettings> {
  return apiFetch<DocumentPrintSettings>("/admin/business-profile/?section=document-print-settings", {
    method: "PATCH",
    body: payload,
  });
}

export async function getSetupChecklist(): Promise<SetupChecklist> {
  return apiFetch<SetupChecklist>("/admin/business-setup/checklist/");
}

export async function getSetupReadiness(): Promise<SetupReadinessPayload> {
  return apiFetch<SetupReadinessPayload>("/admin/setup/readiness/");
}

export async function getDocumentNumberingState(): Promise<DocumentNumberingState> {
  return apiFetch<DocumentNumberingState>("/admin/business-setup/document-numbering/");
}

export type DocumentNumberingUpdatePayload = {
  key: string;
  prefix?: string;
  pattern?: string;
  suffix?: string;
  reset_policy?: "NEVER" | "YEARLY" | "MONTHLY" | string;
  next_number?: number;
  padding?: number;
};

export async function updateDocumentNumbering(payload: DocumentNumberingUpdatePayload): Promise<DocumentNumberingState> {
  return apiFetch<DocumentNumberingState>("/admin/business-setup/document-numbering/", {
    method: "PATCH",
    body: payload,
  });
}

export async function getResetPreview(preserveUsername?: string): Promise<Record<string, unknown>> {
  const query = preserveUsername ? `?preserve_username=${encodeURIComponent(preserveUsername)}` : "";
  return apiFetch<Record<string, unknown>>(`/admin/business-setup/reset-preview/${query}`);
}

export type BusinessResetExecuteRequest = {
  confirm: boolean;
  preserve_username: string;
  delete_non_preserved_users?: boolean;
  clear_auth_artifacts?: boolean;
  dry_run?: boolean;
};

export async function executeBusinessReset(payload: BusinessResetExecuteRequest): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>("/admin/business-setup/reset/", {
    method: "POST",
    body: payload,
  });
}

export type ResetScope = {
  code: string;
  label: string;
  danger_level: string;
  requires_backup: boolean;
  model_labels: string[];
};

export async function getResetScopes(): Promise<{ scopes: ResetScope[] }> {
  return apiFetch<{ scopes: ResetScope[] }>("/admin/business-setup/reset-scopes/");
}

export async function getModularResetPreview(payload: { scopes: string[]; preserve_username: string; preserve_user_ids?: number[] }): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>("/admin/business-setup/reset-preview-v2/", {
    method: "POST",
    body: payload,
  });
}

export async function executeModularReset(payload: { scopes: string[]; preserve_username: string; confirmation_phrase: string; backup_job_id?: number }): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>("/admin/business-setup/reset-v2/", {
    method: "POST",
    body: payload,
  });
}

export async function getBackupJobs(): Promise<{ results: unknown[]; jobs: unknown[] }> {
  const payload = await apiFetch<{ results?: unknown[]; jobs?: unknown[] }>("/admin/business-setup/backups/");
  const rows = payload.jobs ?? payload.results ?? [];
  return { ...payload, results: rows, jobs: rows };
}

export async function createBackupJob(payload: { job_type: string; scopes: string[] }): Promise<Record<string, unknown> & { id?: number }> {
  return apiFetch<Record<string, unknown> & { id?: number }>("/admin/business-setup/backups/", {
    method: "POST",
    body: payload,
  });
}

export async function getRestoreJobs(): Promise<{ results: unknown[]; jobs: unknown[] }> {
  const payload = await apiFetch<{ results?: unknown[]; jobs?: unknown[] }>("/admin/business-setup/restore-jobs/");
  const rows = payload.jobs ?? payload.results ?? [];
  return { ...payload, results: rows, jobs: rows };
}

export async function createRestorePreview(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>("/admin/business-setup/restore/preview/", {
    method: "POST",
    body: payload,
  });
}

export async function executeRestore(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>("/admin/business-setup/restore/", {
    method: "POST",
    body: payload,
  });
}

export const listBackupJobs = getBackupJobs;
export const listRestoreJobs = getRestoreJobs;
export const getRestorePreview = createRestorePreview;
