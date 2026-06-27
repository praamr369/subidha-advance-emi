"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import ErrorState from "@/components/feedback/ErrorState";
import ActionButton from "@/components/ui/ActionButton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  getDryRunHistory,
  getDryRunOptions,
  postDryRunRun,
  type DryRunCheckOption,
  type DryRunHistoryRun,
  type DryRunResultRow,
  type DryRunRunResponse,
} from "@/services/business-setup/dry-runs";
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

const DRY_RUN_SECTIONS: { id: string; title: string; keys: string[] }[] = [
  { id: "quick", title: "Quick checks", keys: ["SETUP_READINESS", "API_CONTRACT"] },
  { id: "setup", title: "Setup & accounting", keys: ["ACCOUNTING_SETUP"] },
  { id: "data", title: "Data management", keys: ["SELECTIVE_RESET_PREVIEW", "EXPORT_PREVIEW", "IMPORT_PREVIEW"] },
  { id: "frontend", title: "Frontend workflow", keys: ["FRONTEND_ROUTE_WORKFLOW"] },
  { id: "finance", title: "Finance safety", keys: ["PAYMENT_FINANCE_SAFETY"] },
  { id: "ops", title: "Operations readiness", keys: ["LUCKY_PLAN_WORKFLOW", "INVENTORY_SALES_PURCHASE_READINESS", "HR_READINESS"] },
];

function toErr(e: unknown) {
  return e instanceof Error ? e.message : typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message) : "Request failed.";
}

function recordRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
}

function statusBadge(status: string) {
  if (status === "PASS") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (status === "WARNING") return "border-amber-300 bg-amber-50 text-amber-950";
  if (status === "BLOCKED" || status === "FAILED") return "border-red-300 bg-red-50 text-red-900";
  return "border-border bg-muted text-muted-foreground";
}

function SummaryKpi({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className={`rounded-xl border p-4 text-center shadow-sm ${tone ?? "border-border bg-card"}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ResultTable({ rows }: { rows: DryRunResultRow[] }) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => {
    const order: Record<string, number> = { BLOCKED: 0, FAILED: 1, WARNING: 2, PASS: 3 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });
  return (
    <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Check</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Title / Detail</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Action</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Link</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {sorted.map((row, idx) => (
            <tr key={`${row.check}-${idx}`}>
              <td className="px-3 py-2 align-top">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadge(row.status)}`}>{row.status}</span>
              </td>
              <td className="px-3 py-2 align-top text-xs text-muted-foreground">{row.check}</td>
              <td className="px-3 py-2 align-top">
                <div className="font-medium text-foreground">{row.title}</div>
                {row.detail ? <div className="mt-1 max-w-sm text-xs text-muted-foreground">{row.detail}</div> : null}
              </td>
              <td className="px-3 py-2 align-top text-xs text-muted-foreground">{row.recommended_action}</td>
              <td className="px-3 py-2 align-top">
                {row.action_href?.startsWith("/") ? (
                  <Link href={row.action_href} className="text-sm font-medium text-primary hover:underline">Open</Link>
                ) : <span className="text-muted-foreground">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResetSummary({ result }: { result: Record<string, unknown> }) {
  const deleted = (result.deleted_counts as Record<string, number> | null) ?? {};
  const skipped = (result.skipped as string[] | null) ?? [];
  const blockers = (result.blockers as string[] | null) ?? [];
  return (
    <div className="space-y-3">
      {blockers.length > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div className="font-semibold">Blockers</div>
          <ul className="mt-1 list-disc pl-5">{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </div>
      ) : null}
      {Object.keys(deleted).length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4">
          {Object.entries(deleted).map(([model, count]) => (
            <div key={model} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
              <div className="font-semibold text-foreground">{model}</div>
              <div className="mt-1 text-muted-foreground">{count} deleted</div>
            </div>
          ))}
        </div>
      ) : null}
      {skipped.length > 0 ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Skipped: {skipped.join(", ")}
        </div>
      ) : null}
      {result.dry_run ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 font-semibold">Dry-run only — no data was deleted.</div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 font-semibold">Reset executed successfully.</div>
      )}
    </div>
  );
}

// ─── DRY RUNS SECTION ────────────────────────────────────────────────────────

function DryRunsSection() {
  const [checks, setChecks] = useState<DryRunCheckOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(["SETUP_READINESS", "API_CONTRACT"]));
  const [includeFinancial, setIncludeFinancial] = useState(true);
  const [includePersonal, setIncludePersonal] = useState(false);
  const [includeHighRisk, setIncludeHighRisk] = useState(false);
  const [scopesText, setScopesText] = useState("");
  const [loading, setLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<DryRunRunResponse | null>(null);
  const [history, setHistory] = useState<DryRunHistoryRun[]>([]);

  const allKeys = useMemo(() => checks.map((c) => c.key), [checks]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setOptionsError(null);
      const [optRes, histRes] = await Promise.allSettled([getDryRunOptions(), getDryRunHistory(10)]);
      if (optRes.status === "fulfilled") setChecks(optRes.value.checks);
      if (histRes.status === "fulfilled") setHistory(histRes.value.runs);
    } catch (err) {
      setOptionsError(toErr(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  function toggle(key: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }

  async function run(keys: string[]) {
    if (!keys.length) { setRunError("Select at least one check."); return; }
    setRunning(true); setRunError(null);
    try {
      const scopes = scopesText.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
      const res = await postDryRunRun({ checks: keys, scopes, options: { include_financial_checks: includeFinancial, include_personal_data_checks: includePersonal, include_high_risk: includeHighRisk } });
      setLastRun(res);
      const hist = await getDryRunHistory(10);
      setHistory(hist.runs);
    } catch (err) { setRunError(toErr(err)); }
    finally { setRunning(false); }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        Dry runs are read-only. They validate readiness, routing, dependencies, and financial safety without mutating any business data.
      </div>

      {optionsError ? <ErrorState description={optionsError} onRetry={() => void loadAll()} /> : null}
      {runError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{runError}</div> : null}

      {/* Options */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="text-sm font-semibold text-foreground">Run options</div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <label className="flex items-center gap-2"><input type="checkbox" checked={includeFinancial} onChange={(e) => setIncludeFinancial(e.target.checked)} />Include financial checks</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={includePersonal} onChange={(e) => setIncludePersonal(e.target.checked)} />Personal data awareness</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={includeHighRisk} onChange={(e) => setIncludeHighRisk(e.target.checked)} />High-risk scopes (descriptive only)</label>
        </div>
        <div className="mt-3">
          <label className="text-xs font-medium text-muted-foreground">Optional app scopes (comma-separated)</label>
          <input className="mt-1 w-full max-w-xl rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="e.g. subscriptions, accounting" value={scopesText} onChange={(e) => setScopesText(e.target.value)} />
        </div>
      </div>

      {/* Check catalog */}
      {loading ? <div className="text-sm text-muted-foreground">Loading dry run catalog…</div> : null}
      {DRY_RUN_SECTIONS.map((section) => {
        const sectionChecks = checks.filter((c) => section.keys.includes(c.key));
        if (!sectionChecks.length) return null;
        return (
          <div key={section.id}>
            <div className="text-sm font-semibold text-foreground mb-2">{section.title}</div>
            <div className="grid gap-3 md:grid-cols-2">
              {sectionChecks.map((c) => (
                <label key={c.key} className="flex cursor-pointer gap-3 rounded-xl border border-border bg-card p-4 shadow-sm hover:border-ring">
                  <input type="checkbox" className="mt-1 shrink-0" checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{c.label}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{c.risk_level}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        );
      })}

      {/* Execute */}
      <div className="flex flex-wrap gap-2">
        <ActionButton onClick={() => void run(Array.from(selected))} disabled={running || selected.size === 0}>{running ? "Running…" : "Run selected"}</ActionButton>
        <ActionButton variant="secondary" onClick={() => void run(allKeys)} disabled={running || !allKeys.length}>Run full pre-live</ActionButton>
        <ActionButton variant="secondary" onClick={() => void run(["FRONTEND_ROUTE_WORKFLOW", "API_CONTRACT"])} disabled={running}>Frontend workflow</ActionButton>
        <ActionButton variant="secondary" onClick={() => void run(["PAYMENT_FINANCE_SAFETY", "ACCOUNTING_SETUP"])} disabled={running}>Finance safety</ActionButton>
        <ActionButton variant="secondary" onClick={() => void run(["SELECTIVE_RESET_PREVIEW", "EXPORT_PREVIEW", "IMPORT_PREVIEW"])} disabled={running}>Data management</ActionButton>
      </div>

      {/* Last run results */}
      {lastRun ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <SummaryKpi label="Pass" value={lastRun.summary.pass} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
            <SummaryKpi label="Warning" value={lastRun.summary.warning} tone="border-amber-200 bg-amber-50 text-amber-950" />
            <SummaryKpi label="Blocked" value={lastRun.summary.blocked} tone={lastRun.summary.blocked > 0 ? "border-red-200 bg-red-50 text-red-900" : "border-border bg-card"} />
            <SummaryKpi label="Failed" value={lastRun.summary.failed} tone={lastRun.summary.failed > 0 ? "border-red-200 bg-red-50 text-red-900" : "border-border bg-card"} />
          </div>
          <ResultTable rows={lastRun.results} />
          <p className="text-xs text-muted-foreground">Run ID: {lastRun.run_id}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-6 text-sm text-muted-foreground">
          No results yet. Select checks and run.
        </div>
      )}

      {/* History */}
      {history.length > 0 ? (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground [&[data-state=open]>svg]:rotate-180">
            Run history ({history.length})
            <ChevronDown className="size-4 shrink-0 transition-transform duration-200" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 space-y-2">
              {history.map((run) => (
                <li key={run.run_id} className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{run.run_id}</span>
                    <span className="text-xs text-muted-foreground">{run.created_at}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">PASS {run.summary?.pass ?? 0} · WARN {run.summary?.warning ?? 0} · BLOCKED {run.summary?.blocked ?? 0} · FAILED {run.summary?.failed ?? 0}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{run.checks.join(", ")}</div>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

// ─── RESET & RESTORE SECTION ─────────────────────────────────────────────────

function ResetRestoreSection() {
  const [scopes, setScopes] = useState<ResetScope[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [preserveUsername, setPreserveUsername] = useState("subidhafurniture");
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [resetResult, setResetResult] = useState<Record<string, unknown> | null>(null);
  const [backupJobs, setBackupJobs] = useState<Array<Record<string, unknown>>>([]);
  const [restoreJobs, setRestoreJobs] = useState<Array<Record<string, unknown>>>([]);
  const [selectedBackupId, setSelectedBackupId] = useState<number | null>(null);
  const [restorePreview, setRestorePreview] = useState<Record<string, unknown> | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  // Settings snapshot
  const [snapBusy, setSnapBusy] = useState<"export" | "preview" | "apply" | null>(null);
  const [snapMessage, setSnapMessage] = useState<string | null>(null);
  const [snapError, setSnapError] = useState<string | null>(null);
  const [snapImportFile, setSnapImportFile] = useState<File | null>(null);
  const [snapImportPreview, setSnapImportPreview] = useState<Record<string, unknown> | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [scopeRes, backupsRes, restoreRes] = await Promise.allSettled([getResetScopes(), listBackupJobs(), listRestoreJobs()]);
      if (scopeRes.status === "fulfilled") setScopes(scopeRes.value.scopes || []);
      if (backupsRes.status === "fulfilled") setBackupJobs(recordRows(backupsRes.value.jobs));
      if (restoreRes.status === "fulfilled") setRestoreJobs(recordRows(restoreRes.value.jobs));
    })();
  }, []);

  const hasBlockers = useMemo(() => { const b = preview?.blockers; return Array.isArray(b) && b.length > 0; }, [preview]);

  async function runPreview() {
    setError(null);
    try {
      const data = await getModularResetPreview({ scopes: selected, preserve_username: preserveUsername });
      setPreview(data);
    } catch (e) { setError(toErr(e)); }
  }

  async function runBackup(jobType: "SELECTED_SCOPES_EXPORT" | "FULL_DATABASE_LOGICAL") {
    setError(null);
    try {
      const created = await createBackupJob({ job_type: jobType, scopes: selected });
      setSelectedBackupId(typeof created.id === "number" ? created.id : null);
      const res = await listBackupJobs();
      setBackupJobs(recordRows(res.jobs));
    } catch (e) { setError(toErr(e)); }
  }

  async function runReset() {
    if (confirmation.trim() !== PHRASE) { setError(`Type "${PHRASE}" exactly.`); return; }
    setBusy(true); setError(null);
    try {
      const response = await executeModularReset({ scopes: selected, preserve_username: preserveUsername, confirmation_phrase: confirmation, backup_job_id: selectedBackupId || undefined });
      setResetResult(response);
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(false); }
  }

  async function runRestorePreview() {
    setError(null);
    try {
      let snapshotPayload: Record<string, unknown> | undefined;
      if (restoreFile) {
        const text = await restoreFile.text();
        snapshotPayload = JSON.parse(text) as Record<string, unknown>;
      }
      const payload = snapshotPayload
        ? { restore_type: "SETUP_SNAPSHOT_RESTORE_PREVIEW" as const, snapshot_payload: snapshotPayload, preserve_admin_username: preserveUsername }
        : { restore_type: "FULL_BACKUP_RESTORE_PREVIEW" as const, backup_job_id: selectedBackupId || undefined, scopes: selected };
      const data = await getRestorePreview(payload);
      setRestorePreview(data);
    } catch (e) { setError(toErr(e)); }
  }

  async function runRestoreExecute() {
    const phrase = restoreFile ? "RESTORE SETUP SNAPSHOT" : PHRASE;
    if (restoreConfirm.trim() !== phrase) { setError(`Type "${phrase}" exactly.`); return; }
    const checklist = (restorePreview?.preview as Record<string, unknown> | undefined)?.checklist;
    if (Array.isArray(checklist) && checklist.some((row) => (row as Record<string, unknown>).status === "BLOCKED")) { setError("Restore blocked by checklist issues."); return; }
    const restoreJobId = Number((restorePreview?.restore_job_id as number | undefined) || 0);
    if (!restoreJobId) { setError("No restore job ID. Run preview first."); return; }
    setBusy(true); setError(null);
    try {
      await executeRestore({ restore_job_id: restoreJobId, confirmation_phrase: restoreConfirm });
      const jobs = await listRestoreJobs();
      setRestoreJobs(recordRows(jobs.jobs));
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(false); }
  }

  async function handleSnapshotExport() {
    setSnapBusy("export"); setSnapError(null); setSnapMessage(null);
    try {
      const payload = await exportSetupSnapshot();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `subidha-settings-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      const counts = (payload as { counts?: Record<string, number> }).counts ?? {};
      setSnapMessage(`Exported ${Object.values(counts).reduce((s, n) => s + n, 0)} setup rows across ${Object.keys(counts).length} sections.`);
    } catch (e) { setSnapError(toErr(e)); }
    finally { setSnapBusy(null); }
  }

  async function handleSnapshotImportPreview() {
    if (!snapImportFile) { setSnapError("Choose a file first."); return; }
    setSnapBusy("preview"); setSnapError(null); setSnapImportPreview(null);
    try {
      const text = await snapImportFile.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.kind !== "setup_snapshot") throw new Error("Not a valid setup snapshot file (kind must be 'setup_snapshot').");
      setSnapImportPreview(await importSetupSnapshot(parsed, true, false));
    } catch (e) { setSnapError(toErr(e)); }
    finally { setSnapBusy(null); }
  }

  async function handleSnapshotImportApply() {
    if (!snapImportFile) { setSnapError("Choose a file first."); return; }
    setSnapBusy("apply"); setSnapError(null);
    try {
      const text = await snapImportFile.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.kind !== "setup_snapshot") throw new Error("Not a valid setup snapshot file.");
      const result = await importSetupSnapshot(parsed, false, true);
      const applied = (result as { applied_row_counts?: Record<string, number> }).applied_row_counts ?? {};
      setSnapMessage(`Import applied: ${Object.values(applied).reduce((s, n) => s + n, 0)} rows across ${Object.keys(applied).length} sections.`);
      setSnapImportPreview(null);
    } catch (e) { setSnapError(toErr(e)); }
    finally { setSnapBusy(null); }
  }

  const snapAllowed = snapImportPreview ? snapImportPreview.import_allowed_here !== false : true;
  const snapErrors = Array.isArray(snapImportPreview?.validation_errors) ? (snapImportPreview?.validation_errors as string[]) : [];

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      {/* Settings snapshot */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold text-foreground">Settings snapshot — export / import</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Portable setup/config export (business profile, branches, counters, document sequences, COA, finance accounts, mappings, tax, product taxonomy, reminder templates).
          Never includes customers, payments, invoices, ledgers, or secrets.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void handleSnapshotExport()} disabled={snapBusy !== null}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
            {snapBusy === "export" ? "Exporting…" : "Export settings (download file)"}
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-border p-4">
          <div className="text-sm font-semibold text-foreground">Import settings snapshot</div>
          <p className="mt-1 text-xs text-muted-foreground">Dev/staging only. Validates and upserts setup rows in a single transaction. Blocked in production.</p>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Choose snapshot file</label>
              <input type="file" accept=".json,application/json" className="mt-1 block text-sm"
                onChange={(e) => { setSnapImportFile(e.target.files?.[0] ?? null); setSnapImportPreview(null); setSnapError(null); setSnapMessage(null); }} />
              {snapImportFile ? <p className="mt-1 text-xs text-muted-foreground">{snapImportFile.name} ({Math.round(snapImportFile.size / 1024)} KB)</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void handleSnapshotImportPreview()} disabled={snapBusy !== null || !snapImportFile}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold disabled:opacity-50">
                {snapBusy === "preview" ? "Validating…" : "Preview / validate"}
              </button>
              <button type="button" onClick={() => void handleSnapshotImportApply()} disabled={snapBusy !== null || !snapImportFile || !snapImportPreview || !snapAllowed || snapErrors.length > 0}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
                {snapBusy === "apply" ? "Importing…" : "Apply import"}
              </button>
            </div>
            {snapImportPreview ? (
              <div className="space-y-2 text-xs">
                {!snapAllowed ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">Import is disabled in production. Preview only.</div> : null}
                {snapErrors.length > 0 ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-900">{snapErrors.join("; ")}</div> : null}
                <div className="grid gap-2 sm:grid-cols-3">
                  {Object.entries((snapImportPreview.row_counts as Record<string, number> | undefined) ?? {}).map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-border bg-background px-3 py-2">
                      <div className="font-semibold">{k}</div>
                      <div className="text-muted-foreground">{v} rows</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {snapMessage ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{snapMessage}</div> : null}
        {snapError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{snapError}</div> : null}
      </div>

      {/* Scope selector */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold text-foreground">Reset scope selector</div>
        <p className="mt-1 text-sm text-muted-foreground">Select which modules to include in the reset or backup operation.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {scopes.map((scope) => (
            <label key={scope.code} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/40 cursor-pointer">
              <input type="checkbox" checked={selected.includes(scope.code)} onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, scope.code] : prev.filter((item) => item !== scope.code))} />
              <span className="flex-1 font-medium text-foreground">{scope.label}</span>
              <span className="text-xs text-muted-foreground">{scope.danger_level}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Reset preview + execute */}
      <Collapsible defaultOpen={false} className="rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left text-sm font-semibold text-amber-950 [&[data-state=open]>svg]:rotate-180">
          <span>
            Modular reset
            <span className="ml-2 text-xs font-normal text-amber-800">Destructive — expand only when you intend to reset</span>
          </span>
          <ChevronDown className="size-4 shrink-0 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 border-t border-amber-200 px-5 pb-5 pt-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm text-muted-foreground">Preserve username</label>
                <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={preserveUsername} onChange={(e) => setPreserveUsername(e.target.value)} placeholder="subidhafurniture" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Confirmation phrase</label>
                <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder={PHRASE} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold" onClick={() => void runPreview()}>Run preview</button>
              <button type="button" className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold" onClick={() => void runBackup("SELECTED_SCOPES_EXPORT")}>Create scope backup</button>
              <button type="button" className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold" onClick={() => void runBackup("FULL_DATABASE_LOGICAL")}>Create full backup</button>
              <button type="button" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={hasBlockers || busy} onClick={() => void runReset()}>
                {busy ? "Resetting…" : "Execute reset"}
              </button>
            </div>

            {preview ? (
              <div className="space-y-3">
                {Array.isArray(preview.blockers) && (preview.blockers as string[]).length > 0 ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                    <div className="font-semibold">Blockers</div>
                    <ul className="mt-1 list-disc pl-5">{(preview.blockers as string[]).map((b, i) => <li key={i}>{b}</li>)}</ul>
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-3">
                  {Object.entries((preview.estimated_delete_counts as Record<string, number> | undefined) ?? {}).map(([model, count]) => (
                    <div key={model} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
                      <div className="font-semibold">{model}</div>
                      <div className="text-muted-foreground">{count} to delete</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {resetResult ? <ResetSummary result={resetResult} /> : null}

            {backupJobs.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">Backup jobs</div>
                {backupJobs.map((job) => (
                  <label key={String(job.id)} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm cursor-pointer">
                    <input type="radio" checked={selectedBackupId === job.id} onChange={() => setSelectedBackupId(Number(job.id))} />
                    <span className="font-medium">{String(job.job_type)}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{String(job.status)} · {String(job.created_at ?? "")}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Restore */}
      <Collapsible defaultOpen={false} className="rounded-xl border border-border bg-card shadow-sm">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-sm font-semibold text-foreground [&[data-state=open]>svg]:rotate-180">
          <span>
            Restore from backup or snapshot
            <span className="ml-2 text-xs font-normal text-muted-foreground">Setup snapshot: upload file · Full restore: select backup job</span>
          </span>
          <ChevronDown className="size-4 shrink-0 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 border-t border-border px-5 pb-5 pt-4">
            <p className="text-sm text-muted-foreground">
              Restores setup/master configuration from a downloaded snapshot file, or restores from a backup job created above.
              Does not restore customers, payments, invoices, or financial history.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-foreground">Setup snapshot file (optional)</label>
                <p className="mt-0.5 text-xs text-muted-foreground">Upload a settings snapshot file to restore setup configuration. Leave empty to restore from a backup job instead.</p>
                <input type="file" accept=".json,application/json" className="mt-2 block text-sm"
                  onChange={(e) => { setRestoreFile(e.target.files?.[0] ?? null); setRestorePreview(null); }} />
                {restoreFile ? <p className="mt-1 text-xs text-muted-foreground">{restoreFile.name} ({Math.round(restoreFile.size / 1024)} KB)</p> : null}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Confirmation phrase</label>
                <p className="mt-0.5 text-xs text-muted-foreground">{restoreFile ? "Type: RESTORE SETUP SNAPSHOT" : `Type: ${PHRASE}`}</p>
                <input className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={restoreConfirm} onChange={(e) => setRestoreConfirm(e.target.value)} placeholder={restoreFile ? "RESTORE SETUP SNAPSHOT" : PHRASE} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold" onClick={() => void runRestorePreview()} disabled={!restoreFile && !selectedBackupId}>Preview restore</button>
              <button type="button" className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50" onClick={() => void runRestoreExecute()} disabled={!restorePreview || busy}>{busy ? "Restoring…" : "Execute restore"}</button>
            </div>

            {restorePreview ? (
              <div className="space-y-3">
                {Array.isArray((restorePreview.preview as Record<string, unknown> | undefined)?.checklist) ? (
                  <div className="rounded-xl border border-border">
                    <div className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">Restore checklist</div>
                    <div className="divide-y divide-border">
                      {((restorePreview.preview as Record<string, unknown>).checklist as Array<Record<string, unknown>>).map((row) => (
                        <div key={String(row.key)} className="grid grid-cols-1 gap-1 px-3 py-2 text-xs md:grid-cols-4">
                          <div className="font-medium text-foreground">{String(row.label)}</div>
                          <div className={row.status === "BLOCKED" ? "text-red-600 font-semibold" : "text-emerald-700"}>{String(row.status)}</div>
                          <div className="text-muted-foreground">{String(row.details)}</div>
                          <div className="text-muted-foreground">{String(row.recommended_action)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-3">
                  {Object.entries((restorePreview.estimated_row_counts as Record<string, number> | undefined) ?? {}).map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
                      <div className="font-semibold">{k}</div>
                      <div className="text-muted-foreground">{v} rows</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {restoreJobs.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">Restore history</div>
                {restoreJobs.slice(0, 5).map((job) => (
                  <div key={String(job.id)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
                    <span className="font-medium">{String(job.restore_type ?? job.job_type)}</span>
                    <span className="ml-3 text-muted-foreground">{String(job.status)} · {String(job.created_at ?? "")}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "dry-runs", label: "Dry Runs" },
  { id: "reset-restore", label: "Reset & Restore" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function ResetAndDryRunsPage() {
  const [tab, setTab] = useState<TabId>("dry-runs");

  return (
    <ERPPageShell
      eyebrow="Settings"
      title="Dry Runs & Reset"
      subtitle="Validate setup, routing, and finance safety with dry runs. Manage modular reset, backup, and settings snapshot restore."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.root },
        { label: "Business Setup", href: ROUTES.admin.settingsBusinessSetup },
        { label: "Dry Runs & Reset" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "warning" as const }}
    >
      <div className="space-y-6">
        <BusinessSetupLinks />

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "dry-runs" ? (
          <WorkspaceSection title="Dry Run Control Center" description="Read-only validation. No business data is mutated.">
            <DryRunsSection />
          </WorkspaceSection>
        ) : (
          <WorkspaceSection title="Reset & Restore" description="Modular reset, backup creation, and settings snapshot import/export.">
            <ResetRestoreSection />
          </WorkspaceSection>
        )}
      </div>
    </ERPPageShell>
  );
}
