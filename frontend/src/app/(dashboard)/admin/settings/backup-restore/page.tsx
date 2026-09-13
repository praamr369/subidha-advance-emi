"use client";

import { useCallback, useEffect, useState } from "react";
import { DatabaseBackup, Download, ImageIcon, RefreshCw } from "lucide-react";

import ERPPageShell, { type ERPPageShellProps } from "@/components/erp/ERPPageShell";
import ActionButton from "@/components/ui/ActionButton";
import { WorkspaceSection } from "@/components/ui/workspace";
import { canChooseSaveLocation, saveAuthenticatedFileAs } from "@/lib/export/auth-download";
import {
  createServerBackup,
  getServerBackups,
  serverBackupDownloadPath,
  type ServerBackup,
  type ServerBackupFileName,
  type ServerBackupOverview,
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

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function toErr(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Request failed.";
}

export default function BackupRestorePage() {
  const [data, setData] = useState<ServerBackupOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState<"full" | "media" | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pickerSupported, setPickerSupported] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getServerBackups());
    } catch (e) {
      setError(toErr(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPickerSupported(canChooseSaveLocation());
    void load();
  }, [load]);

  async function backUpNow(includeDatabase: boolean) {
    setCreating(includeDatabase ? "full" : "media");
    setError(null);
    setNotice(null);
    try {
      const { backup } = await createServerBackup({ include_database: includeDatabase });
      setNotice(`Backup ready (${formatBytes(backup.size_bytes)}). Save it to your hard disk from the list below.`);
      await load();
    } catch (e) {
      setError(toErr(e));
    } finally {
      setCreating(null);
    }
  }

  // Called straight from the click so the browser's "Save as" window may open.
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

  const backups = data?.backups ?? [];
  const visible = showAll ? backups : backups.slice(0, INITIAL_ROWS);
  const latest = backups[0];
  const stats: ERPPageShellProps["stats"] = data
    ? [
        { label: "Backups on server", value: backups.length, hint: "Nightly, before updates, and from this page" },
        { label: "Latest backup", value: latest ? formatWhen(latest.created_at) : "None yet", tone: latest ? "default" : "warning" },
        { label: "Product images & files", value: formatBytes(data.media_size_bytes), hint: `${data.media_file_count} files on the server` },
        {
          label: "Database backup",
          value: data.database_backup_available ? "Ready" : "Unavailable",
          tone: data.database_backup_available ? "success" : "warning",
        },
      ]
    : undefined;

  return (
    <ERPPageShell
      title="Backup & Restore"
      subtitle="Back up the database and product images, then save a copy to your own computer or external hard disk"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Backup & Restore" },
      ]}
      stats={stats}
    >
      <div className="space-y-6">
        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            {notice}
          </div>
        ) : null}

        <WorkspaceSection
          title="Back up now"
          description="Makes a fresh backup on the server in a few seconds. Then save it to your hard disk from the list below."
        >
          <div className="flex flex-wrap gap-3">
            <ActionButton
              variant="primary"
              leftIcon={<DatabaseBackup className="h-4 w-4" />}
              loading={creating === "full"}
              disabled={creating !== null || !data?.database_backup_available}
              onClick={() => void backUpNow(true)}
            >
              Full backup (database + images)
            </ActionButton>
            <ActionButton
              variant="outline"
              leftIcon={<ImageIcon className="h-4 w-4" />}
              loading={creating === "media"}
              disabled={creating !== null}
              onClick={() => void backUpNow(false)}
            >
              Images &amp; files only
            </ActionButton>
          </div>
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
          description="Click a file to save it. Save both Database and Images & files from the same row."
          action={
            <ActionButton variant="ghost" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} loading={loading} onClick={() => void load()}>
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
                      <th className="pb-3">Save to your hard disk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {visible.map((backup) => (
                      <tr key={backup.name}>
                        <td className="whitespace-nowrap py-3 pr-4 font-medium">{formatWhen(backup.created_at)}</td>
                        <td className="whitespace-nowrap py-3 pr-4">{BACKUP_TYPE[backup.label] ?? backup.label}</td>
                        <td className="whitespace-nowrap py-3 pr-4">{formatBytes(backup.size_bytes)}</td>
                        <td className="py-3">
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
            <li>Keep both files of one backup together in one folder. The database knows which picture belongs to which product; the images file holds the pictures. One without the other cannot rebuild your catalogue.</li>
            <li>Do this at least once a week, and after adding many products.</li>
          </ol>
          {!pickerSupported ? (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              This browser saves to your Downloads folder. Move the files to the hard disk afterwards — or open this page in Chrome or Edge to pick the hard disk directly.
            </p>
          ) : null}
        </WorkspaceSection>

        <WorkspaceSection title="Restoring from a saved copy">
          <p className="text-sm text-muted-foreground">
            A restore replaces live data, so it runs on the server terminal, not from this page.
          </p>
          <ol className="mt-3 list-inside list-decimal space-y-2 text-sm">
            <li>Identify what is damaged, and stop entering data if integrity is at risk.</li>
            <li>Notify the DPO if personal data is involved (DPDP Act 2023).</li>
            <li>
              Copy the two saved files into a new folder on the server and rename them back to <code>db.dump</code> and <code>media.tar.gz</code>.
            </li>
            <li>
              Run <code>scripts/server/restore.sh &lt;that folder&gt;</code>. It saves the current state first, then restores the database and, if you answer “y”, the images.
            </li>
            <li>Check the restored data against the audit log, then resume work and record what happened.</li>
          </ol>
        </WorkspaceSection>

        <WorkspaceSection title="Keeping backups safe">
          <ul className="space-y-2 text-sm">
            <li>Backups contain every customer record and KYC document. Keep the hard disk somewhere safe and turn on BitLocker (Windows) to encrypt it.</li>
            <li>Backups on the server are not encrypted and sit on the same disk as the app. The copy on your hard disk is what protects you if the server is lost.</li>
            <li>
              To confirm a saved copy is intact, run <code>certutil -hashfile &lt;file&gt; SHA256</code> and compare the result with the line in its checksums file.
            </li>
          </ul>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
