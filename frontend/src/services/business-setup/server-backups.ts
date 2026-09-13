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
