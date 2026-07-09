import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/tokens";
import { API_BASE_URL } from "@/lib/constants";

export type MigrationFieldSpec = {
  key: string;
  label: string;
  required: boolean;
  kind: string;
  choices?: string[];
};

export type MigrationDataset = {
  key: string;
  label: string;
  importable: boolean;
  description: string;
  amount_field: string | null;
  duplicate_keys: string[];
  fields: MigrationFieldSpec[];
};

export type MigrationSource = { key: string; label: string };

export type MigrationBatch = {
  id: number;
  batch_number: string;
  dataset_key: string;
  dataset_label: string;
  source_type: string;
  status: string;
  original_filename: string;
  file_checksum_sha256: string;
  file_size_bytes: number;
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  duplicate_rows: number;
  imported_rows: number;
  skipped_rows: number;
  failed_rows: number;
  mapping?: Record<string, string>;
  source_headers?: string[];
  preview_summary?: Record<string, unknown> | null;
  reconciliation_snapshot?: ReconciliationSnapshot | null;
  expected_total?: string | null;
  created_at: string;
  created_by?: string | null;
  approved_at?: string | null;
  import_started_at?: string | null;
  import_finished_at?: string | null;
  duration_seconds?: number | null;
  rolled_back_at?: string | null;
  notes?: string;
};

export type ReconciliationSnapshot = {
  dataset?: string;
  amount_field?: string | null;
  expected_total?: string | null;
  imported_total?: string | null;
  difference?: string | null;
  matched?: boolean | null;
  imported_rows?: number;
  failed_rows?: number;
  skipped_rows?: number;
};

export type MigrationStagingRow = {
  row_number: number;
  status: string;
  raw_data: Record<string, string>;
  mapped_data: Record<string, string>;
  errors: string[];
  warnings: string[];
  duplicate_matches: Array<Record<string, unknown>>;
  duplicate_resolution: string;
  target_model?: string;
  target_pk?: number | null;
  import_error?: string;
};

export type MigrationOverview = {
  datasets: MigrationDataset[];
  sources: MigrationSource[];
  recent_batches: MigrationBatch[];
};

export type ReadinessItem = {
  key: string;
  label: string;
  ready: boolean;
  source: string;
  optional?: boolean;
};

export type BusinessReadiness = {
  items: ReadinessItem[];
  reconciliation: { batches: Array<Record<string, unknown>>; all_resolved: boolean };
  core_overall_status: string;
  ready_for_go_live: boolean;
};

export function getMigrationOverview() {
  return apiFetch<MigrationOverview>("/admin/migration/overview/");
}

export function uploadMigrationFile(file: File, datasetKey: string, sourceType: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("dataset_key", datasetKey);
  form.append("source_type", sourceType);
  return apiFetch<MigrationBatch>("/admin/migration/upload/", { method: "POST", body: form });
}

export function listMigrationBatches(params?: { dataset_key?: string; status?: string }) {
  const query = new URLSearchParams();
  if (params?.dataset_key) query.set("dataset_key", params.dataset_key);
  if (params?.status) query.set("status", params.status);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<{ batches: MigrationBatch[] }>(`/admin/migration/batches/${suffix}`);
}

export function getMigrationBatch(batchId: number) {
  return apiFetch<MigrationBatch>(`/admin/migration/batches/${batchId}/`);
}

export function deleteMigrationBatch(batchId: number) {
  return apiFetch<{ deleted: string }>(`/admin/migration/batches/${batchId}/`, { method: "DELETE" });
}

export function getMigrationRows(batchId: number, params?: { status?: string; offset?: number; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<{ total: number; offset: number; limit: number; rows: MigrationStagingRow[] }>(
    `/admin/migration/batches/${batchId}/rows/${suffix}`
  );
}

export function updateMigrationMapping(batchId: number, mapping: Record<string, string>, saveAs?: string) {
  return apiFetch<MigrationBatch>(`/admin/migration/batches/${batchId}/mapping/`, {
    method: "PUT",
    body: JSON.stringify({ mapping, save_as: saveAs || undefined }),
  });
}

export function validateMigrationBatch(batchId: number) {
  return apiFetch<{ counts: { valid: number; warning: number; error: number }; batch: MigrationBatch }>(
    `/admin/migration/batches/${batchId}/validate/`,
    { method: "POST" }
  );
}

export function detectMigrationDuplicates(batchId: number) {
  return apiFetch<{ duplicates: number; checked_fields: string[]; batch: MigrationBatch }>(
    `/admin/migration/batches/${batchId}/duplicates/`,
    { method: "POST" }
  );
}

export function setDuplicateResolutions(batchId: number, resolutions: Array<{ row_number: number; resolution: string }>) {
  return apiFetch<{ updated: number }>(`/admin/migration/batches/${batchId}/duplicates/`, {
    method: "PUT",
    body: JSON.stringify({ resolutions }),
  });
}

export function previewMigrationBatch(batchId: number) {
  return apiFetch<{ summary: Record<string, unknown>; batch: MigrationBatch }>(
    `/admin/migration/batches/${batchId}/preview/`,
    { method: "POST" }
  );
}

export function executeMigrationBatch(batchId: number, confirmation: string) {
  return apiFetch<{ result: Record<string, unknown>; batch: MigrationBatch }>(
    `/admin/migration/batches/${batchId}/execute/`,
    { method: "POST", body: JSON.stringify({ confirmation }) }
  );
}

export function rollbackMigrationBatch(batchId: number, confirmation: string) {
  return apiFetch<{ result: Record<string, unknown>; batch: MigrationBatch }>(
    `/admin/migration/batches/${batchId}/rollback/`,
    { method: "POST", body: JSON.stringify({ confirmation }) }
  );
}

export function reconcileMigrationBatch(batchId: number, expectedTotal?: string) {
  return apiFetch<{ snapshot: ReconciliationSnapshot }>(`/admin/migration/batches/${batchId}/reconcile/`, {
    method: "POST",
    body: JSON.stringify({ expected_total: expectedTotal ?? null }),
  });
}

export function getMigrationReconciliation() {
  return apiFetch<{ batches: Array<Record<string, unknown>>; all_resolved: boolean }>(
    "/admin/migration/reconciliation/"
  );
}

export function getMigrationAuditLog(batchId?: number) {
  const suffix = batchId ? `?batch_id=${batchId}` : "";
  return apiFetch<{ logs: Array<{ id: number; action: string; batch_number: string | null; actor: string | null; payload: Record<string, unknown>; created_at: string }> }>(
    `/admin/migration/audit-log/${suffix}`
  );
}

export function getBusinessReadiness() {
  return apiFetch<BusinessReadiness>("/admin/migration/readiness/");
}

// ── Data Workbench (in-webapp editing) ──────────────────────────────────────

export function createWorkbenchBatch(datasetKey: string) {
  return apiFetch<MigrationBatch>("/admin/migration/workbench/", {
    method: "POST",
    body: JSON.stringify({ dataset_key: datasetKey }),
  });
}

export function addWorkbenchRow(batchId: number, data: Record<string, string>) {
  return apiFetch<{ row: MigrationStagingRow; batch: MigrationBatch }>(
    `/admin/migration/batches/${batchId}/rows/`,
    { method: "POST", body: JSON.stringify({ data }) }
  );
}

export function updateWorkbenchRow(batchId: number, rowNumber: number, data: Record<string, string>) {
  return apiFetch<{ row: MigrationStagingRow; batch: MigrationBatch }>(
    `/admin/migration/batches/${batchId}/rows/${rowNumber}/`,
    { method: "PATCH", body: JSON.stringify({ data }) }
  );
}

export function deleteWorkbenchRow(batchId: number, rowNumber: number) {
  return apiFetch<{ batch: MigrationBatch }>(
    `/admin/migration/batches/${batchId}/rows/${rowNumber}/`,
    { method: "DELETE" }
  );
}

export function bulkSetWorkbenchRows(batchId: number, rows: Array<Record<string, string>>) {
  return apiFetch<{ saved: number; batch: MigrationBatch }>(
    `/admin/migration/batches/${batchId}/rows/`,
    { method: "PUT", body: JSON.stringify({ rows }) }
  );
}

export function adoptUploadForEditing(batchId: number) {
  return apiFetch<MigrationBatch>(`/admin/migration/batches/${batchId}/adopt-workbench/`, {
    method: "POST",
  });
}

export function migrationTemplateUrl(datasetKey: string, format: "csv" | "xlsx") {
  return `${API_BASE_URL.replace(/\/+$/, "")}/admin/migration/templates/${datasetKey}/?file_format=${format}`;
}

export async function downloadMigrationFile(path: string, filename: string) {
  const token = getAccessToken();
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error("Download failed.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function migrationErrorReportUrl(batchId: number) {
  return `${API_BASE_URL.replace(/\/+$/, "")}/admin/migration/batches/${batchId}/error-report/`;
}

export function migrationReconciliationReportUrl(batchId: number) {
  return `${API_BASE_URL.replace(/\/+$/, "")}/admin/migration/batches/${batchId}/reconciliation-report/`;
}
