"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Cloud,
  CloudUpload,
  DatabaseBackup,
  Download,
  HardDrive,
  ImageIcon,
  RefreshCw,
  Trash2,
} from "lucide-react";

import ERPPageShell, { type ERPPageShellProps } from "@/components/erp/ERPPageShell";
import ActionButton from "@/components/ui/ActionButton";
import { WorkspaceSection } from "@/components/ui/workspace";
import { canChooseSaveLocation, saveAuthenticatedFileAs } from "@/lib/export/auth-download";
import {
  batchArchiveDownloadPath,
  createAndSyncServerBackup,
  createServerBackup,
  exportBatchArchive,
  getCloudStorageSettings,
  getServerBackups,
  getStorageMaintenanceStats,
  listCompletedBatches,
  runStorageMaintenance,
  serverBackupDownloadPath,
  syncBackupToCloud,
  testCloudStorageConnection,
  updateCloudStorageSettings,
  type BatchArchiveResult,
  type CloudStorageSettings,
  type CompletedBatch,
  type ServerBackup,
  type ServerBackupFileName,
  type ServerBackupOverview,
  type StorageMaintenanceResult,
  type StorageMaintenanceStats,
} from "@/services/business-setup/server-backups";

const FILE_LABEL: Record<ServerBackupFileName, string> = {
  "db.dump": "Database",
  "media.tar.gz": "Images & files",
  "checksums.txt": "Checksums",
};

const BACKUP_TYPE: Record<string, string> = {
  scheduled: "Nightly (automatic)",
  manual: "Made from this page",
  "pre-update": "Before an update",
};

const INITIAL_ROWS = 15;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function toErr(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Request failed.";
}

export default function BackupRestorePage() {
  const [activeTab, setActiveTab] = useState<"backups" | "cloud_setup" | "storage_cleanup">("backups");

  // Tab 1 state
  const [data, setData] = useState<ServerBackupOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState<"full" | "full_cloud" | "media" | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [syncingCloud, setSyncingCloud] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pickerSupported, setPickerSupported] = useState(false);

  // Tab 2: Free Cloud Setup state
  const [cloudSettings, setCloudSettings] = useState<CloudStorageSettings | null>(null);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [savingCloud, setSavingCloud] = useState(false);
  const [testingCloud, setTestingCloud] = useState(false);
  const [secretKeyInput, setSecretKeyInput] = useState("");

  // Tab 3: Storage Maintenance & Archival state
  const [storageStats, setStorageStats] = useState<StorageMaintenanceStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [runningCleanup, setRunningCleanup] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<StorageMaintenanceResult | null>(null);
  const [pruneTokens, setPruneTokens] = useState(true);
  const [pruneSessions, setPruneSessions] = useState(true);
  const [runVacuum, setRunVacuum] = useState(false);

  // Batch Archival state
  const [batches, setBatches] = useState<CompletedBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | "">("");
  const [pushArchiveToCloud, setPushArchiveToCloud] = useState(true);
  const [exportingArchive, setExportingArchive] = useState(false);
  const [archiveResult, setArchiveResult] = useState<BatchArchiveResult | null>(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getServerBackups());
    } catch (e) {
      setError(toErr(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCloudSettings = useCallback(async () => {
    setLoadingCloud(true);
    try {
      const cfg = await getCloudStorageSettings();
      setCloudSettings(cfg);
    } catch (e) {
      setError(toErr(e));
    } finally {
      setLoadingCloud(false);
    }
  }, []);

  const loadMaintenanceStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [stats, bList] = await Promise.all([
        getStorageMaintenanceStats(),
        listCompletedBatches().catch(() => []),
      ]);
      setStorageStats(stats);
      setBatches(bList);
      if (bList.length > 0 && selectedBatchId === "") {
        setSelectedBatchId(bList[0].id);
      }
    } catch (e) {
      setError(toErr(e));
    } finally {
      setLoadingStats(false);
    }
  }, [selectedBatchId]);

  useEffect(() => {
    setPickerSupported(canChooseSaveLocation());
    void loadBackups();
    void loadCloudSettings();
    void loadMaintenanceStats();
  }, [loadBackups, loadCloudSettings, loadMaintenanceStats]);

  async function backUpNow(includeDatabase: boolean, andPushToCloud = false) {
    setCreating(andPushToCloud ? "full_cloud" : includeDatabase ? "full" : "media");
    setError(null);
    setNotice(null);
    try {
      if (andPushToCloud) {
        const { backup, cloud_sync } = await createAndSyncServerBackup({ include_database: includeDatabase });
        const cloudNote = cloud_sync?.all_successful
          ? " and successfully synced to Free Cloud Storage!"
          : " (cloud sync reported issues; check Free Cloud Setup tab).";
        setNotice(`Backup ready (${formatBytes(backup.size_bytes)})${cloudNote}`);
      } else {
        const { backup } = await createServerBackup({ include_database: includeDatabase });
        setNotice(`Backup ready (${formatBytes(backup.size_bytes)}). Save it to your hard disk from the list below.`);
      }
      await loadBackups();
    } catch (e) {
      setError(toErr(e));
    } finally {
      setCreating(null);
    }
  }

  async function handleCloudSync(backupName: string) {
    setSyncingCloud(backupName);
    setError(null);
    setNotice(null);
    try {
      const res = await syncBackupToCloud({ name: backupName });
      if (res.all_successful) {
        setNotice(`Backup ${backupName} successfully pushed to Free Cloud Storage!`);
      } else {
        setNotice(`Sync completed with notes: ${res.results.map((r) => `${r.file}: ${r.message}`).join(", ")}`);
      }
    } catch (e) {
      setError(toErr(e));
    } finally {
      setSyncingCloud(null);
    }
  }

  async function save(backup: ServerBackup, file: ServerBackupFileName) {
    setSaving(`${backup.name}/${file}`);
    setError(null);
    setNotice(null);
    try {
      const result = await saveAuthenticatedFileAs(
        serverBackupDownloadPath(backup.name, file),
        `subidha-${backup.name}-${file}`
      );
      if (result === "saved") {
        setNotice(
          pickerSupported
            ? `${FILE_LABEL[file]} saved to the location you chose.`
            : `${FILE_LABEL[file]} downloaded to your Downloads folder — move it to your hard disk.`
        );
      }
    } catch (e) {
      setError(toErr(e));
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveCloudSettings() {
    if (!cloudSettings) return;
    setSavingCloud(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Partial<CloudStorageSettings> = {
        provider: cloudSettings.provider,
        endpoint_url: cloudSettings.endpoint_url,
        bucket_name: cloudSettings.bucket_name,
        access_key_id: cloudSettings.access_key_id,
        rclone_remote_name: cloudSettings.rclone_remote_name,
        is_enabled: cloudSettings.is_enabled,
        auto_sync_nightly: cloudSettings.auto_sync_nightly,
      };
      if (secretKeyInput.trim()) {
        payload.secret_access_key = secretKeyInput.trim();
      }
      const updated = await updateCloudStorageSettings(payload);
      setCloudSettings(updated);
      setSecretKeyInput("");
      setNotice("Free Cloud Storage settings saved successfully.");
    } catch (e) {
      setError(toErr(e));
    } finally {
      setSavingCloud(false);
    }
  }

  async function handleTestCloudConnection() {
    setTestingCloud(true);
    setError(null);
    setNotice(null);
    try {
      const res = await testCloudStorageConnection();
      await loadCloudSettings();
      if (res.success) {
        setNotice(`Connection verified: ${res.message}`);
      } else {
        setError(`Test failed: ${res.message}`);
      }
    } catch (e) {
      setError(toErr(e));
    } finally {
      setTestingCloud(false);
    }
  }

  async function handleRunStorageCleanup() {
    setRunningCleanup(true);
    setError(null);
    setNotice(null);
    try {
      const res = await runStorageMaintenance({
        prune_tokens: pruneTokens,
        prune_sessions: pruneSessions,
        run_vacuum: runVacuum,
      });
      setCleanupResult(res);
      setNotice(`Storage cleanup completed: ${res.actions_taken.join(" ")}`);
      await loadMaintenanceStats();
    } catch (e) {
      setError(toErr(e));
    } finally {
      setRunningCleanup(false);
    }
  }

  async function handleExportBatchArchive() {
    if (!selectedBatchId) return;
    setExportingArchive(true);
    setError(null);
    setNotice(null);
    setArchiveResult(null);
    try {
      const res = await exportBatchArchive({
        batch_id: Number(selectedBatchId),
        push_to_cloud: pushArchiveToCloud && Boolean(cloudSettings?.is_enabled),
      });
      setArchiveResult(res);
      setNotice(`Batch archive exported: ${res.filename} (${formatBytes(res.size_bytes)})`);
    } catch (e) {
      setError(toErr(e));
    } finally {
      setExportingArchive(false);
    }
  }

  const backups = data?.backups ?? [];
  const visible = showAll ? backups : backups.slice(0, INITIAL_ROWS);
  const latest = backups[0];
  const stats: ERPPageShellProps["stats"] = data
    ? [
        { label: "Backups on server", value: backups.length, hint: "Nightly, manual & pre-update" },
        { label: "Latest backup", value: latest ? formatWhen(latest.created_at) : "None yet", tone: latest ? "default" : "warning" },
        {
          label: "Free Cloud Sync",
          value: cloudSettings?.is_enabled ? (cloudSettings.provider === "CLOUDFLARE_R2" ? "Cloudflare R2" : "Google Drive") : "Disabled",
          tone: cloudSettings?.is_enabled ? "success" : "default",
          hint: cloudSettings?.last_test_success ? "Verified active" : "Check setup tab",
        },
        {
          label: "Database Size",
          value: storageStats?.database?.size_formatted ?? (data.database_backup_available ? "Ready" : "Unavailable"),
          hint: `${storageStats?.expired_tokens_count ?? 0} expired tokens`,
        },
      ]
    : undefined;

  return (
    <ERPPageShell
      title="Backup, Free Cloud Sync & Storage Archival"
      subtitle="Safely archive completed batches, clean dead database bloat, and sync backups to free offsite storage (Cloudflare R2 / Google Drive) for ₹0"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Backup & Restore" },
      ]}
      stats={stats}
    >
      <div className="space-y-6">
        {error ? (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {notice ? (
          <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        ) : null}

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 dark:border-gray-800">
          <button
            type="button"
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "backups"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("backups")}
          >
            <HardDrive className="h-4 w-4" />
            Backups &amp; Local Files
          </button>
          <button
            type="button"
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "cloud_setup"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("cloud_setup")}
          >
            <Cloud className="h-4 w-4" />
            Free Cloud Setup (R2 / Google)
            {cloudSettings?.is_enabled && cloudSettings.last_test_success ? (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Active
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "storage_cleanup"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("storage_cleanup")}
          >
            <Archive className="h-4 w-4" />
            Free Storage Optimization &amp; Archival
          </button>
        </div>

        {/* TAB 1: BACKUPS & FILES */}
        {activeTab === "backups" && (
          <div className="space-y-6">
            <WorkspaceSection
              title="Back up now"
              description="Make a fresh backup on the server, and optionally push it directly to your free offsite cloud storage."
            >
              <div className="flex flex-wrap gap-3">
                <ActionButton
                  variant="primary"
                  leftIcon={<CloudUpload className="h-4 w-4" />}
                  loading={creating === "full_cloud"}
                  disabled={creating !== null || !data?.database_backup_available || !cloudSettings?.is_enabled}
                  onClick={() => void backUpNow(true, true)}
                >
                  Full Backup + Push to Free Cloud
                </ActionButton>
                <ActionButton
                  variant="outline"
                  leftIcon={<DatabaseBackup className="h-4 w-4" />}
                  loading={creating === "full"}
                  disabled={creating !== null || !data?.database_backup_available}
                  onClick={() => void backUpNow(true, false)}
                >
                  Full backup (local only)
                </ActionButton>
                <ActionButton
                  variant="outline"
                  leftIcon={<ImageIcon className="h-4 w-4" />}
                  loading={creating === "media"}
                  disabled={creating !== null}
                  onClick={() => void backUpNow(false, false)}
                >
                  Images &amp; files only
                </ActionButton>
              </div>

              {!cloudSettings?.is_enabled ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Free Cloud Storage is currently disabled. Configure Cloudflare R2 or Google Drive in the <strong>Free Cloud Setup</strong> tab to enable 1-click cloud sync.
                </p>
              ) : null}

              {data && !data.database_backup_available ? (
                <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                  Database backup is not available on this server ({data.database_engine}; needs PostgreSQL and pg_dump). Images can still be backed up.
                </p>
              ) : null}
              <p className="mt-3 text-xs text-muted-foreground">
                The server keeps the last {data?.manual_keep ?? 5} backups made from this page. Nightly backups run automatically at 08:00 IST and the last 7 are kept.
              </p>
            </WorkspaceSection>

            <WorkspaceSection
              title="Backups on the server"
              description="Download files to your hard disk or sync an existing backup to your free offsite cloud storage."
              action={
                <ActionButton variant="ghost" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} loading={loading} onClick={() => void loadBackups()}>
                  Refresh
                </ActionButton>
              }
            >
              {loading && !data ? (
                <p className="text-sm text-muted-foreground">Loading backups…</p>
              ) : backups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No backups on the server yet. Click “Full backup” above to make the first one.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="pb-3 pr-4">When</th>
                          <th className="pb-3 pr-4">Type</th>
                          <th className="pb-3 pr-4">Size</th>
                          <th className="pb-3 pr-4">Save to hard disk</th>
                          <th className="pb-3">Free Cloud Sync</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {visible.map((backup) => (
                          <tr key={backup.name}>
                            <td className="whitespace-nowrap py-3 pr-4 font-medium">{formatWhen(backup.created_at)}</td>
                            <td className="whitespace-nowrap py-3 pr-4">{BACKUP_TYPE[backup.label] ?? backup.label}</td>
                            <td className="whitespace-nowrap py-3 pr-4">{formatBytes(backup.size_bytes)}</td>
                            <td className="py-3 pr-4">
                              <div className="flex flex-wrap gap-2">
                                {backup.files.map((file) => (
                                  <ActionButton
                                    key={file.name}
                                    variant={file.name === "checksums.txt" ? "ghost" : "outline"}
                                    size="sm"
                                    leftIcon={<Download className="h-3.5 w-3.5" />}
                                    loading={saving === `${backup.name}/${file.name}`}
                                    disabled={saving !== null}
                                    onClick={() => void save(backup, file.name)}
                                  >
                                    {FILE_LABEL[file.name]} · {formatBytes(file.size_bytes)}
                                  </ActionButton>
                                ))}
                              </div>
                            </td>
                            <td className="py-3">
                              <ActionButton
                                variant="ghost"
                                size="sm"
                                leftIcon={<CloudUpload className="h-3.5 w-3.5" />}
                                loading={syncingCloud === backup.name}
                                disabled={syncingCloud !== null || !cloudSettings?.is_enabled}
                                onClick={() => void handleCloudSync(backup.name)}
                              >
                                Push to Cloud
                              </ActionButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {backups.length > INITIAL_ROWS ? (
                    <button type="button" className="mt-3 text-sm font-medium text-primary hover:underline" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? "Show fewer" : `Show all ${backups.length} backups`}
                    </button>
                  ) : null}
                </>
              )}
            </WorkspaceSection>

            <WorkspaceSection title="Saving a copy to your hard disk">
              <ol className="list-inside list-decimal space-y-2 text-sm">
                <li>Plug in your external hard disk.</li>
                <li>
                  On one backup row, click <strong>Database</strong>, then <strong>Images &amp; files</strong>
                  {pickerSupported ? " — in the window that opens, choose a folder on the hard disk." : "."}
                </li>
                <li>Keep both files together in one folder. The database knows which picture belongs to which product; the images file holds the pictures. One without the other cannot rebuild your catalogue.</li>
                <li>Do this at least once a week, and after adding many products.</li>
              </ol>
            </WorkspaceSection>
          </div>
        )}

        {/* TAB 2: FREE CLOUD SETUP */}
        {activeTab === "cloud_setup" && (
          <div className="space-y-6">
            <WorkspaceSection
              title="Configure Free Offsite Cloud Storage"
              description="Store backups and batch archives offsite using 100% permanent free tiers (₹0 extra cost)."
            >
              {loadingCloud && !cloudSettings ? (
                <p className="text-sm text-muted-foreground">Loading cloud configuration…</p>
              ) : (
                <div className="space-y-6">
                  {/* Provider selection cards */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div
                      className={`cursor-pointer rounded-lg border p-4 transition-all ${
                        cloudSettings?.provider === "CLOUDFLARE_R2"
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-gray-200 hover:border-gray-300 dark:border-gray-800"
                      }`}
                      onClick={() =>
                        setCloudSettings((prev) =>
                          prev ? { ...prev, provider: "CLOUDFLARE_R2" } : null
                        )
                      }
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">Cloudflare R2 (S3-Compatible)</span>
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          10 GB Free Forever
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Recommended. Generous 10 GB free storage, $0 download (egress) fees, direct HTTP S3 protocol without installing extra software.
                      </p>
                    </div>

                    <div
                      className={`cursor-pointer rounded-lg border p-4 transition-all ${
                        cloudSettings?.provider === "GOOGLE_DRIVE"
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-gray-200 hover:border-gray-300 dark:border-gray-800"
                      }`}
                      onClick={() =>
                        setCloudSettings((prev) =>
                          prev ? { ...prev, provider: "GOOGLE_DRIVE" } : null
                        )
                      }
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">Google Drive (via rclone)</span>
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          15 GB Free Forever
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Uses standard free Gmail / Google Drive accounts via the open-source Linux `rclone` utility.
                      </p>
                    </div>
                  </div>

                  {/* Enable Switch */}
                  <div className="flex items-center gap-3">
                    <input
                      id="enableCloud"
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      checked={Boolean(cloudSettings?.is_enabled)}
                      onChange={(e) =>
                        setCloudSettings((prev) =>
                          prev ? { ...prev, is_enabled: e.target.checked } : null
                        )
                      }
                    />
                    <label htmlFor="enableCloud" className="text-sm font-medium text-foreground">
                      Enable Free Cloud Storage Sync
                    </label>
                  </div>

                  {/* Provider Specific Fields */}
                  {cloudSettings?.provider === "CLOUDFLARE_R2" && (
                    <div className="space-y-4 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground">
                          R2 S3 Endpoint URL
                        </label>
                        <input
                          type="text"
                          className="mt-1 block w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-primary dark:border-gray-700"
                          placeholder="https://<account_id>.r2.cloudflarestorage.com"
                          value={cloudSettings.endpoint_url || ""}
                          onChange={(e) =>
                            setCloudSettings((prev) =>
                              prev ? { ...prev, endpoint_url: e.target.value } : null
                            )
                          }
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Found in Cloudflare Dashboard &gt; R2 &gt; Overview (Right sidebar &quot;S3 API&quot;).
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground">
                            R2 Bucket Name
                          </label>
                          <input
                            type="text"
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-primary dark:border-gray-700"
                            placeholder="subidha-backups"
                            value={cloudSettings.bucket_name || ""}
                            onChange={(e) =>
                              setCloudSettings((prev) =>
                                prev ? { ...prev, bucket_name: e.target.value } : null
                              )
                            }
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-muted-foreground">
                            R2 Access Key ID
                          </label>
                          <input
                            type="text"
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-primary dark:border-gray-700"
                            placeholder="e.g. 9b7...2f"
                            value={cloudSettings.access_key_id || ""}
                            onChange={(e) =>
                              setCloudSettings((prev) =>
                                prev ? { ...prev, access_key_id: e.target.value } : null
                              )
                            }
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-muted-foreground">
                          R2 Secret Access Key
                        </label>
                        <input
                          type="password"
                          className="mt-1 block w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-primary dark:border-gray-700"
                          placeholder={cloudSettings.has_secret_access_key ? "•••••••••••••••• (Leave blank to keep existing)" : "Enter secret access key"}
                          value={secretKeyInput}
                          onChange={(e) => setSecretKeyInput(e.target.value)}
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Stored encrypted at rest with Fernet. It is never returned in plain text.
                        </p>
                      </div>
                    </div>
                  )}

                  {cloudSettings?.provider === "GOOGLE_DRIVE" && (
                    <div className="space-y-4 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground">
                          rclone Remote Name &amp; Folder
                        </label>
                        <input
                          type="text"
                          className="mt-1 block w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-primary dark:border-gray-700"
                          placeholder="gdrive:subidha_backups"
                          value={cloudSettings.rclone_remote_name || ""}
                          onChange={(e) =>
                            setCloudSettings((prev) =>
                              prev ? { ...prev, rclone_remote_name: e.target.value } : null
                            )
                          }
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Default is <code>gdrive:subidha_backups</code>. Ensure `rclone` is configured on the host server.
                        </p>
                      </div>

                      <div className="rounded border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                        <strong>Quick Server Setup:</strong>
                        <pre className="mt-1 overflow-x-auto rounded bg-black/10 p-2 font-mono dark:bg-black/30">
                          sudo apt-get install rclone{"\n"}
                          rclone config   # choose 18 (Google Drive), name it &apos;gdrive&apos;
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Test Status Box */}
                  {cloudSettings?.last_test_at ? (
                    <div
                      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                        cloudSettings.last_test_success
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                      }`}
                    >
                      {cloudSettings.last_test_success ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      )}
                      <div>
                        <div className="font-semibold">
                          Last Test ({formatWhen(cloudSettings.last_test_at)}):{" "}
                          {cloudSettings.last_test_success ? "Success" : "Failed"}
                        </div>
                        <div className="text-xs">{cloudSettings.last_test_message}</div>
                      </div>
                    </div>
                  ) : null}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3">
                    <ActionButton
                      variant="primary"
                      loading={savingCloud}
                      onClick={() => void handleSaveCloudSettings()}
                    >
                      Save Configuration
                    </ActionButton>
                    <ActionButton
                      variant="outline"
                      leftIcon={<RefreshCw className="h-4 w-4" />}
                      loading={testingCloud}
                      onClick={() => void handleTestCloudConnection()}
                    >
                      Test Cloud Connection
                    </ActionButton>
                  </div>
                </div>
              )}
            </WorkspaceSection>

            <WorkspaceSection title="Why Cloudflare R2 is 100% Free Forever">
              <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
                <li>
                  <strong>10 GB Free Storage:</strong> Cloudflare R2 includes 10 GB of storage every single month for $0.
                </li>
                <li>
                  <strong>$0 Bandwidth / Egress:</strong> Unlike AWS S3 which charges when downloading backups, Cloudflare R2 has <strong>zero egress fees</strong>.
                </li>
                <li>
                  <strong>Step 1:</strong> Log into <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer" className="text-primary underline">Cloudflare Dashboard</a> &gt; Click <strong>R2 Object Storage</strong>.
                </li>
                <li>
                  <strong>Step 2:</strong> Click <strong>Create Bucket</strong> (e.g. <code>subidha-backups</code>).
                </li>
                <li>
                  <strong>Step 3:</strong> Click <strong>Manage R2 API Tokens</strong> &gt; Create token with <strong>Object Read &amp; Write</strong> permissions &gt; Copy Endpoint URL, Access Key, and Secret Key into the fields above.
                </li>
              </ul>
            </WorkspaceSection>
          </div>
        )}

        {/* TAB 3: STORAGE CLEANUP & ARCHIVAL */}
        {activeTab === "storage_cleanup" && (
          <div className="space-y-6">
            {/* Database Storage Overview */}
            <WorkspaceSection
              title="Database Storage Health &amp; Bloat Scan"
              description="Monitor table sizes, live rows, and dead tuple bloat in PostgreSQL."
              action={
                <ActionButton variant="ghost" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} loading={loadingStats} onClick={() => void loadMaintenanceStats()}>
                  Refresh
                </ActionButton>
              }
            >
              {loadingStats && !storageStats ? (
                <p className="text-sm text-muted-foreground">Scanning database storage…</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-gray-200 bg-background p-4 dark:border-gray-800">
                      <div className="text-xs font-medium text-muted-foreground">Total Database Size</div>
                      <div className="mt-1 text-2xl font-bold text-foreground">{storageStats?.database?.size_formatted ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">Engine: {storageStats?.database?.vendor}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-background p-4 dark:border-gray-800">
                      <div className="text-xs font-medium text-muted-foreground">Expired JWT Tokens</div>
                      <div className="mt-1 text-2xl font-bold text-foreground">{storageStats?.expired_tokens_count ?? 0}</div>
                      <div className="text-[11px] text-muted-foreground">Ready to prune safely</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-background p-4 dark:border-gray-800">
                      <div className="text-xs font-medium text-muted-foreground">Expired User Sessions</div>
                      <div className="mt-1 text-2xl font-bold text-foreground">{storageStats?.expired_sessions_count ?? 0}</div>
                      <div className="text-[11px] text-muted-foreground">Ready to clear safely</div>
                    </div>
                  </div>

                  {storageStats?.database?.tables && storageStats.database.tables.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                            <th className="pb-2">Table</th>
                            <th className="pb-2">Total Disk Size</th>
                            <th className="pb-2">Live Tuples</th>
                            <th className="pb-2">Dead Tuples (Bloat)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {storageStats.database.tables.map((t) => (
                            <tr key={t.table}>
                              <td className="py-2 font-mono text-xs font-semibold">{t.table}</td>
                              <td className="py-2">{t.size}</td>
                              <td className="py-2 text-muted-foreground">{t.live_rows.toLocaleString()}</td>
                              <td className="py-2">
                                <span className={t.dead_rows > 1000 ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                                  {t.dead_rows.toLocaleString()}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </WorkspaceSection>

            {/* Zero-Cost Cleanup Action */}
            <WorkspaceSection
              title="Run Free Storage Cleanup"
              description="Reclaim dead disk pages, flush expired auth tokens, and clear expired sessions without affecting active financial records."
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      checked={pruneTokens}
                      onChange={(e) => setPruneTokens(e.target.checked)}
                    />
                    <span>Flush Expired JWT Refresh Tokens (from token rotation)</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      checked={pruneSessions}
                      onChange={(e) => setPruneSessions(e.target.checked)}
                    />
                    <span>Clear Expired Django Sessions</span>
                  </label>
                  {storageStats?.database?.vendor === "postgresql" && (
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        checked={runVacuum}
                        onChange={(e) => setRunVacuum(e.target.checked)}
                      />
                      <span>Run Non-blocking PostgreSQL VACUUM (ANALYZE) to reclaim dead row pages</span>
                    </label>
                  )}
                </div>

                <ActionButton
                  variant="primary"
                  leftIcon={<Trash2 className="h-4 w-4" />}
                  loading={runningCleanup}
                  onClick={() => void handleRunStorageCleanup()}
                >
                  Run Free Storage Cleanup
                </ActionButton>

                {cleanupResult && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <div className="font-semibold">Cleanup Results:</div>
                    <ul className="mt-1 list-inside list-disc space-y-1 text-xs">
                      {cleanupResult.actions_taken.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </WorkspaceSection>

            {/* Closed Batch Archival */}
            <WorkspaceSection
              title="Closed Lucky Plan Batch Archival"
              description="Export completed batches into compressed standalone JSON archives (.json.gz). Keeps main database tables lightning fast."
            >
              <div className="space-y-4">
                {batches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No completed or closed Lucky Plan batches found yet. When a batch completes its tenure, you can export and archive its records here.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground">
                          Select Batch to Archive
                        </label>
                        <select
                          className="mt-1 block w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-primary dark:border-gray-700"
                          value={selectedBatchId}
                          onChange={(e) => setSelectedBatchId(Number(e.target.value))}
                        >
                          {batches.map((b) => (
                            <option key={b.id} value={b.id}>
                              Batch: {b.batch_code} ({b.duration_months} mo · {b.subscription_count} subscriptions · Status: {b.status})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center pt-5">
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            checked={pushArchiveToCloud}
                            onChange={(e) => setPushArchiveToCloud(e.target.checked)}
                          />
                          <span>Also push archive to Free Cloud Storage (Cloudflare R2)</span>
                        </label>
                      </div>
                    </div>

                    <ActionButton
                      variant="primary"
                      leftIcon={<Archive className="h-4 w-4" />}
                      loading={exportingArchive}
                      disabled={!selectedBatchId}
                      onClick={() => void handleExportBatchArchive()}
                    >
                      Export Compressed Batch Archive (.json.gz)
                    </ActionButton>

                    {archiveResult && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Archive Created Successfully!</span>
                          <span className="text-xs font-bold">{formatBytes(archiveResult.size_bytes)}</span>
                        </div>
                        <div className="mt-2 text-xs">
                          Records archived: {archiveResult.records_count.subscriptions} Subscriptions,{" "}
                          {archiveResult.records_count.emis} EMIs, {archiveResult.records_count.payments} Payments,{" "}
                          {archiveResult.records_count.lucky_draws} Draws.
                        </div>
                        {archiveResult.cloud_sync_message && (
                          <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                            Cloud sync: {archiveResult.cloud_sync_message}
                          </div>
                        )}
                        <div className="mt-3">
                          <a
                            href={batchArchiveDownloadPath(archiveResult.filename)}
                            download
                            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download {archiveResult.filename}
                          </a>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </WorkspaceSection>
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
