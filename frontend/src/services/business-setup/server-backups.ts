import { apiFetch } from "@/lib/api";

export type ServerBackupFileName = "db.dump" | "media.tar.gz" | "checksums.txt";

export type ServerBackup = {
  name: string;
  label: string;
  created_at: string;
  size_bytes: number;
  files: Array<{ name: ServerBackupFileName; size_bytes: number }>;
  has_database: boolean;
  has_media: boolean;
  deployed_commit: string;
};

export type ServerBackupOverview = {
  backup_root: string;
  backup_root_exists: boolean;
  media_root: string;
  media_file_count: number;
  media_size_bytes: number;
  database_engine: string;
  database_backup_available: boolean;
  manual_keep: number;
  backups: ServerBackup[];
};

export function getServerBackups(): Promise<ServerBackupOverview> {
  return apiFetch<ServerBackupOverview>("/admin/business-setup/server-backups/");
}

export function createServerBackup(payload: { include_database: boolean }): Promise<{ backup: ServerBackup }> {
  return apiFetch<{ backup: ServerBackup }>("/admin/business-setup/server-backups/", { method: "POST", body: payload });
}

export function serverBackupDownloadPath(name: string, file: ServerBackupFileName): string {
  return `/admin/business-setup/server-backups/${encodeURIComponent(name)}/download/${encodeURIComponent(file)}/`;
}

export type CloudStorageProvider = "CLOUDFLARE_R2" | "GOOGLE_DRIVE" | "LOCAL_ONLY";

export type CloudStorageSettings = {
  id?: number;
  provider: CloudStorageProvider;
  endpoint_url: string;
  bucket_name: string;
  access_key_id: string;
  secret_access_key?: string;
  has_secret_access_key: boolean;
  rclone_remote_name: string;
  is_enabled: boolean;
  auto_sync_nightly: boolean;
  last_test_at: string | null;
  last_test_success: boolean | null;
  last_test_message: string;
  created_at?: string;
  updated_at?: string;
};

export type CloudStorageTestResult = {
  success: boolean;
  message: string;
};

export function getCloudStorageSettings(): Promise<CloudStorageSettings> {
  return apiFetch<CloudStorageSettings>("/admin/business-setup/cloud-storage/");
}

export function updateCloudStorageSettings(payload: Partial<CloudStorageSettings>): Promise<CloudStorageSettings> {
  return apiFetch<CloudStorageSettings>("/admin/business-setup/cloud-storage/", {
    method: "PATCH",
    body: payload,
  });
}

export function testCloudStorageConnection(): Promise<CloudStorageTestResult> {
  return apiFetch<CloudStorageTestResult>("/admin/business-setup/cloud-storage/test/", {
    method: "POST",
  });
}

export function syncBackupToCloud(payload: { name: string }): Promise<{
  backup: string;
  results: Array<{ file: string; success: boolean; message: string }>;
  all_successful: boolean;
}> {
  return apiFetch("/admin/business-setup/server-backups/cloud-sync/", {
    method: "POST",
    body: payload,
  });
}

export function createAndSyncServerBackup(payload: { include_database: boolean }): Promise<{
  backup: ServerBackup;
  cloud_sync: {
    backup: string;
    results: Array<{ file: string; success: boolean; message: string }>;
    all_successful: boolean;
  } | null;
}> {
  return apiFetch("/admin/business-setup/server-backups/cloud-sync/", {
    method: "POST",
    body: { create_and_sync: true, ...payload },
  });
}

export type StorageMaintenanceStats = {
  expired_tokens_count: number;
  expired_sessions_count: number;
  database: {
    vendor: string;
    size_formatted: string;
    tables: Array<{
      table: string;
      size: string;
      live_rows: number;
      dead_rows: number;
    }>;
  };
};

export type StorageMaintenanceResult = {
  success: boolean;
  actions_taken: string[];
  before: StorageMaintenanceStats;
  after: StorageMaintenanceStats;
};

export function getStorageMaintenanceStats(): Promise<StorageMaintenanceStats> {
  return apiFetch<StorageMaintenanceStats>("/admin/business-setup/storage-maintenance/");
}

export function runStorageMaintenance(payload: {
  prune_tokens?: boolean;
  prune_sessions?: boolean;
  run_vacuum?: boolean;
}): Promise<StorageMaintenanceResult> {
  return apiFetch<StorageMaintenanceResult>("/admin/business-setup/storage-maintenance/", {
    method: "POST",
    body: payload,
  });
}

export type CompletedBatch = {
  id: number;
  batch_code: string;
  duration_months: number;
  total_slots: number;
  start_date: string | null;
  status: string;
  subscription_count: number;
};

export function listCompletedBatches(): Promise<CompletedBatch[]> {
  return apiFetch<CompletedBatch[]>("/admin/business-setup/batch-archives/");
}

export type BatchArchiveResult = {
  filename: string;
  size_bytes: number;
  records_count: {
    subscriptions: number;
    emis: number;
    payments: number;
    lucky_draws: number;
  };
  cloud_sync_message: string | null;
};

export function exportBatchArchive(payload: {
  batch_id: number;
  push_to_cloud?: boolean;
}): Promise<BatchArchiveResult> {
  return apiFetch<BatchArchiveResult>("/admin/business-setup/batch-archives/", {
    method: "POST",
    body: payload,
  });
}

export function batchArchiveDownloadPath(filename: string): string {
  return `/admin/business-setup/batch-archives/${encodeURIComponent(filename)}/download/`;
}

