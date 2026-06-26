"use client";

import { useEffect, useMemo, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import {
  createBackupJob,
  executeModularReset,
  executeRestore,
  getModularResetPreview,
  getResetScopes,
  getRestorePreview,
  listBackupJobs,
  listRestoreJobs,
  type ResetScope,
} from "@/services/business-setup";
import { exportSetupSnapshot, importSetupSnapshot } from "@/services/local-sandbox";

const PHRASE = "RESET_SUBIDHA_CORE";

function err(e: unknown) {
  return e instanceof Error ? e.message : "Request failed.";
}

function recordRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
}

export default function BusinessSetupResetPage() {
  const [scopes, setScopes] = useState<ResetScope[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [preserveUsername, setPreserveUsername] = useState("subidhafurniture");
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<Record<string, unknown> | null>(null);
  const [backupJobs, setBackupJobs] = useState<Array<Record<string, unknown>>>([]);
  const [restoreJobs, setRestoreJobs] = useState<Array<Record<string, unknown>>>([]);
  const [selectedBackupId, setSelectedBackupId] = useState<number | null>(null);
  const [restorePreview, setRestorePreview] = useState<Record<string, unknown> | null>(null);
  const [restoreType, setRestoreType] = useState<
    "FULL_BACKUP_RESTORE_PREVIEW" | "SELECTED_SCOPE_RESTORE_PREVIEW" | "SETUP_SNAPSHOT_RESTORE_PREVIEW" | "LOCAL_SANDBOX_RESTORE_PREVIEW"
  >("FULL_BACKUP_RESTORE_PREVIEW");
  const [snapshotPayloadText, setSnapshotPayloadText] = useState("");
  const [restoreConfirm, setRestoreConfirm] = useState("");

  // Settings snapshot (portable setup/config export+import)
  const [snapBusy, setSnapBusy] = useState<"export" | "preview" | "apply" | null>(null);
  const [snapMessage, setSnapMessage] = useState<string | null>(null);
  const [snapError, setSnapError] = useState<string | null>(null);
  const [snapImportFile, setSnapImportFile] = useState<File | null>(null);
  const [snapImportPreview, setSnapImportPreview] = useState<Record<string, unknown> | null>(null);

  async function handleSnapshotExport() {
    setSnapBusy("export");
    setSnapError(null);
    setSnapMessage(null);
    try {
      const payload = await exportSetupSnapshot();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `subidha-settings-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      const counts = (payload as { counts?: Record<string, number> }).counts ?? {};
      const total = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0);
      setSnapMessage(`Exported ${total} setup/config rows across ${Object.keys(counts).length} sections.`);
    } catch (e) {
      setSnapError(err(e));
    } finally {
      setSnapBusy(null);
    }
  }

  async function readImportPayload(): Promise<Record<string, unknown>> {
    if (!snapImportFile) throw new Error("Choose a snapshot JSON file first.");
    const text = await snapImportFile.text();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || parsed.kind !== "setup_snapshot") {
      throw new Error("File is not a valid setup snapshot (kind must be 'setup_snapshot').");
    }
    return parsed;
  }

  async function handleSnapshotImportPreview() {
    setSnapBusy("preview");
    setSnapError(null);
    setSnapMessage(null);
    setSnapImportPreview(null);
    try {
      const payload = await readImportPayload();
      const result = await importSetupSnapshot(payload, true, false);
      setSnapImportPreview(result);
    } catch (e) {
      setSnapError(err(e));
    } finally {
      setSnapBusy(null);
    }
  }

  async function handleSnapshotImportApply() {
    setSnapBusy("apply");
    setSnapError(null);
    setSnapMessage(null);
    try {
      const payload = await readImportPayload();
      const result = await importSetupSnapshot(payload, false, true);
      const applied = (result as { applied_row_counts?: Record<string, number> }).applied_row_counts ?? {};
      const total = Object.values(applied).reduce((sum, n) => sum + Number(n || 0), 0);
      setSnapMessage(`Import applied: ${total} rows upserted across ${Object.keys(applied).length} sections.`);
      setSnapImportPreview(null);
    } catch (e) {
      setSnapError(err(e));
    } finally {
      setSnapBusy(null);
    }
  }

  const snapImportAllowedHere = snapImportPreview
    ? snapImportPreview.import_allowed_here !== false
    : true;
  const snapValidationErrors = Array.isArray(snapImportPreview?.validation_errors)
    ? (snapImportPreview?.validation_errors as string[])
    : [];

  useEffect(() => {
    void (async () => {
      const [scopeRes, backupsRes, restoreRes] = await Promise.all([
        getResetScopes(),
        listBackupJobs(),
        listRestoreJobs(),
      ]);
      setScopes(scopeRes.scopes || []);
      setBackupJobs(recordRows(backupsRes.jobs));
      setRestoreJobs(recordRows(restoreRes.jobs));
    })().catch((e) => setPreviewError(err(e)));
  }, []);

  const hasBlockers = useMemo(() => {
    const blockers = preview?.blockers;
    return Array.isArray(blockers) && blockers.length > 0;
  }, [preview]);

  async function runPreview() {
    try {
      setPreviewError(null);
      const data = await getModularResetPreview({
        scopes: selected,
        preserve_username: preserveUsername,
      });
      setPreview(data);
    } catch (e) {
      setPreviewError(err(e));
    }
  }

  async function runBackup(jobType: "SELECTED_SCOPES_EXPORT" | "FULL_DATABASE_LOGICAL") {
    try {
      const created = await createBackupJob({ job_type: jobType, scopes: selected });
      setSelectedBackupId(typeof created.id === "number" ? created.id : null);
      const res = await listBackupJobs();
      setBackupJobs(recordRows(res.jobs));
    } catch (e) {
      setPreviewError(err(e));
    }
  }

  async function runReset() {
    if (confirmation.trim() !== PHRASE) {
      setPreviewError(`Type ${PHRASE} exactly.`);
      return;
    }
    try {
      const response = await executeModularReset({
        scopes: selected,
        preserve_username: preserveUsername,
        confirmation_phrase: confirmation,
        backup_job_id: selectedBackupId || undefined,
      });
      setResetResult(response);
    } catch (e) {
      setPreviewError(err(e));
    }
  }

  async function runRestorePreview() {
    try {
      const payload =
        restoreType === "SETUP_SNAPSHOT_RESTORE_PREVIEW"
          ? {
              restore_type: restoreType,
              snapshot_payload: JSON.parse(snapshotPayloadText || "{}"),
              preserve_admin_username: preserveUsername,
            }
          : { restore_type: restoreType, backup_job_id: selectedBackupId || undefined, scopes: selected };
      const data = await getRestorePreview(payload);
      setRestorePreview(data);
    } catch (e) {
      setPreviewError(err(e));
    }
  }

  async function runRestoreExecute() {
    const requiredPhrase =
      restoreType === "SETUP_SNAPSHOT_RESTORE_PREVIEW" ? "RESTORE SETUP SNAPSHOT" : PHRASE;
    if (restoreConfirm.trim() !== requiredPhrase) {
      setPreviewError(`Type ${requiredPhrase} exactly.`);
      return;
    }
    const checklist = (restorePreview?.preview as Record<string, unknown> | undefined)?.checklist;
    if (Array.isArray(checklist) && checklist.some((row) => (row as Record<string, unknown>).status === "BLOCKED")) {
      setPreviewError("Restore blocked by checklist issues.");
      return;
    }
    const restoreJobId = Number((restorePreview?.restore_job_id as number | undefined) || 0);
    if (!restoreJobId) return;
    try {
      await executeRestore({ restore_job_id: restoreJobId, confirmation_phrase: restoreConfirm });
      const jobs = await listRestoreJobs();
      setRestoreJobs(recordRows(jobs.jobs));
    } catch (e) {
      setPreviewError(err(e));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Modular Reset + Backup / Restore" description="Admin-only governance for safe reset and package-based restore." />
      <BusinessSetupLinks />

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Settings Snapshot — Export / Import</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Portable setup/config/master data only (business profile, branches, counters, document sequences,
          chart of accounts, finance accounts, accounting mappings, tax setup, product taxonomy, reminder
          templates). Never includes customers, payments, invoices, ledgers, draw results, KYC files, or secrets.
          Use this to carry settings across redeploys.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSnapshotExport()}
            disabled={snapBusy !== null}
            className="rounded bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50"
          >
            {snapBusy === "export" ? "Exporting…" : "Export settings (download JSON)"}
          </button>
          <span className="text-xs text-muted-foreground">Export works in all environments (read-only).</span>
        </div>

        <div className="mt-4 rounded-lg border border-border p-3">
          <div className="text-sm font-semibold">Import settings snapshot</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Import is permitted in development/staging only and is blocked in production. It validates the
            package and upserts setup rows by stable code/key inside a single transaction.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                setSnapImportFile(e.target.files?.[0] ?? null);
                setSnapImportPreview(null);
                setSnapError(null);
                setSnapMessage(null);
              }}
              className="text-xs"
            />
            <button
              type="button"
              onClick={() => void handleSnapshotImportPreview()}
              disabled={snapBusy !== null || !snapImportFile}
              className="rounded border border-border px-3 py-2 text-sm disabled:opacity-50"
            >
              {snapBusy === "preview" ? "Validating…" : "Preview / validate"}
            </button>
            <button
              type="button"
              onClick={() => void handleSnapshotImportApply()}
              disabled={
                snapBusy !== null ||
                !snapImportFile ||
                !snapImportPreview ||
                !snapImportAllowedHere ||
                snapValidationErrors.length > 0
              }
              className="rounded bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50"
            >
              {snapBusy === "apply" ? "Importing…" : "Apply import"}
            </button>
          </div>

          {snapImportPreview ? (
            <div className="mt-2 text-xs">
              {!snapImportAllowedHere ? (
                <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
                  Import is disabled in this environment (production). Preview only.
                </div>
              ) : null}
              {snapValidationErrors.length > 0 ? (
                <div className="mt-1 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-rose-900">
                  {snapValidationErrors.join("; ")}
                </div>
              ) : null}
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-2">{JSON.stringify(snapImportPreview.row_counts ?? {}, null, 2)}</pre>
            </div>
          ) : null}
        </div>

        {snapMessage ? <div className="mt-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{snapMessage}</div> : null}
        {snapError ? <div className="mt-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">{snapError}</div> : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Reset Scope Selector</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {scopes.map((scope) => (
            <label key={scope.code} className="flex items-center gap-2 rounded border border-border p-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(scope.code)}
                onChange={(e) => {
                  setSelected((prev) =>
                    e.target.checked ? [...prev, scope.code] : prev.filter((item) => item !== scope.code)
                  );
                }}
              />
              <span>{scope.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{scope.danger_level}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Reset Preview Panel</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            className="rounded border border-input px-3 py-2 text-sm"
            value={preserveUsername}
            onChange={(e) => setPreserveUsername(e.target.value)}
            placeholder="Preserve admin username"
          />
          <input
            className="rounded border border-input px-3 py-2 text-sm"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={PHRASE}
          />
          <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => void runPreview()}>
            Run preview
          </button>
        </div>
        {previewError ? <p className="mt-2 text-sm text-destructive">{previewError}</p> : null}
        {preview ? <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(preview, null, 2)}</pre> : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Backup Before Reset Panel</h2>
        <div className="mt-3 flex gap-2">
          <button type="button" className="rounded border border-border px-3 py-2 text-sm" onClick={() => void runBackup("SELECTED_SCOPES_EXPORT")}>Create selected-scope export</button>
          <button type="button" className="rounded border border-border px-3 py-2 text-sm" onClick={() => void runBackup("FULL_DATABASE_LOGICAL")}>Create full logical backup metadata</button>
          <button type="button" className="rounded bg-destructive px-3 py-2 text-sm text-destructive-foreground" disabled={hasBlockers} onClick={() => void runReset()}>
            Execute reset
          </button>
        </div>
        <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(backupJobs, null, 2)}</pre>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Restore / Import Panel</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <label className="text-sm">
            Restore type
            <select
              className="mt-1 w-full rounded border border-input px-2 py-2 text-sm"
              value={restoreType}
              onChange={(e) =>
                setRestoreType(
                  e.target.value as
                    | "FULL_BACKUP_RESTORE_PREVIEW"
                    | "SELECTED_SCOPE_RESTORE_PREVIEW"
                    | "SETUP_SNAPSHOT_RESTORE_PREVIEW"
                    | "LOCAL_SANDBOX_RESTORE_PREVIEW"
                )
              }
            >
              <option value="FULL_BACKUP_RESTORE_PREVIEW">FULL_BACKUP_RESTORE_PREVIEW</option>
              <option value="SELECTED_SCOPE_RESTORE_PREVIEW">SELECTED_SCOPE_RESTORE_PREVIEW</option>
              <option value="SETUP_SNAPSHOT_RESTORE_PREVIEW">SETUP_SNAPSHOT_RESTORE_PREVIEW</option>
              <option value="LOCAL_SANDBOX_RESTORE_PREVIEW">LOCAL_SANDBOX_RESTORE_PREVIEW</option>
            </select>
          </label>
          <label className="text-sm">
            Confirmation phrase
            <input
              className="mt-1 w-full rounded border border-input px-2 py-2 text-sm"
              value={restoreConfirm}
              onChange={(e) => setRestoreConfirm(e.target.value)}
              placeholder={restoreType === "SETUP_SNAPSHOT_RESTORE_PREVIEW" ? "RESTORE SETUP SNAPSHOT" : PHRASE}
            />
          </label>
        </div>
        {restoreType === "SETUP_SNAPSHOT_RESTORE_PREVIEW" ? (
          <div className="mt-3 space-y-2">
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs">
              Restores setup/master configuration only. Does not restore customers, payments, subscriptions, sales, stock movements, invoices, receipts, audit logs, or financial history.
            </div>
            <textarea
              className="h-40 w-full rounded border border-input p-2 text-xs"
              value={snapshotPayloadText}
              onChange={(e) => setSnapshotPayloadText(e.target.value)}
              placeholder="Paste setup snapshot JSON package"
            />
            <div className="text-xs text-muted-foreground">
              Not for full production database rollback. Use the Dry Runs page for read-only validation before any restore.
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button type="button" className="rounded border border-border px-3 py-2 text-sm" onClick={() => void runRestorePreview()} disabled={restoreType !== "SETUP_SNAPSHOT_RESTORE_PREVIEW" && !selectedBackupId}>
            Preview restore
          </button>
          <button type="button" className="rounded border border-border px-3 py-2 text-sm" onClick={() => void runRestoreExecute()} disabled={!restorePreview}>
            Execute restore
          </button>
        </div>
        {restorePreview ? (
          <div className="mt-3 space-y-3">
            {Array.isArray((restorePreview.preview as Record<string, unknown> | undefined)?.checklist) ? (
              <div className="rounded border border-border">
                <div className="border-b p-2 text-xs font-semibold">Setup Snapshot Restore Checklist</div>
                <div className="divide-y">
                  {((restorePreview.preview as Record<string, unknown>).checklist as Array<Record<string, unknown>>).map((row) => (
                    <div key={String(row.key)} className="grid grid-cols-1 gap-1 p-2 text-xs md:grid-cols-4">
                      <div className="font-medium">{String(row.label)}</div>
                      <div>{String(row.status)}</div>
                      <div>{String(row.details)}</div>
                      <div>{String(row.recommended_action)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(restorePreview, null, 2)}</pre>
          </div>
        ) : null}
        <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(restoreJobs, null, 2)}</pre>
      </section>

      {resetResult ? <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(resetResult, null, 2)}</pre> : null}
    </div>
  );
}
