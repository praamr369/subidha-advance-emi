"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import QuickDataEntryWorkbench from "./QuickDataEntryWorkbench";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import { setFinanceOpeningBalance } from "@/services/vendor-ops";
import {
  addWorkbenchRow,
  adoptUploadForEditing,
  bulkSetWorkbenchRows,
  createWorkbenchBatch,
  deleteMigrationBatch,
  detectMigrationDuplicates,
  downloadMigrationFile,
  executeMigrationBatch,
  getBusinessReadiness,
  getMigrationAuditLog,
  getMigrationOverview,
  getMigrationReconciliation,
  getMigrationRows,
  listMigrationBatches,
  migrationErrorReportUrl,
  migrationTemplateUrl,
  previewMigrationBatch,
  reconcileMigrationBatch,
  rollbackMigrationBatch,
  setDuplicateResolutions,
  updateMigrationMapping,
  uploadMigrationFile,
  validateMigrationBatch,
  type BusinessReadiness,
  type MigrationBatch,
  type MigrationDataset,
  type MigrationOverview,
  type MigrationStagingRow,
} from "@/services/migration-center";

function toErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "readableMessage" in e) return String((e as { readableMessage: unknown }).readableMessage);
  return "Request failed.";
}

const STATUS_COLORS: Record<string, string> = {
  IMPORTED: "bg-emerald-500/15 text-emerald-600",
  PARTIALLY_IMPORTED: "bg-amber-500/15 text-amber-600",
  FAILED: "bg-red-500/15 text-red-600",
  ROLLED_BACK: "bg-slate-500/15 text-slate-600",
  VALIDATED: "bg-blue-500/15 text-blue-600",
  PREVIEWED: "bg-blue-500/15 text-blue-600",
  UPLOADED: "bg-slate-500/15 text-slate-600",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[status] ?? "bg-slate-500/15 text-slate-600"}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

const WIZARD_STEPS = ["Upload", "Mapping", "Validation", "Duplicates", "Preview", "Import", "Reconcile"] as const;

type TabKey = "overview" | "quick_entry" | "wizard" | "workbench" | "templates" | "history" | "reconciliation" | "readiness" | "audit";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "quick_entry", label: "Quick Data Entry" },
  { key: "wizard", label: "Import Wizard" },
  { key: "workbench", label: "Data Workbench" },
  { key: "templates", label: "Templates" },
  { key: "history", label: "Import History" },
  { key: "reconciliation", label: "Reconciliation" },
  { key: "readiness", label: "Business Readiness" },
  { key: "audit", label: "Audit Log" },
];

export default function MigrationCenterPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [overview, setOverview] = useState<MigrationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Handoff: an uploaded batch adopted into the workbench for online editing.
  const [handoffBatch, setHandoffBatch] = useState<MigrationBatch | null>(null);
  // Preselect a dataset when jumping into a fresh workbench (opening-balance shortcuts).
  const [preselectDataset, setPreselectDataset] = useState<string | null>(null);

  const refreshOverview = useCallback(() => {
    getMigrationOverview().then(setOverview).catch((e) => setError(toErr(e)));
  }, []);

  useEffect(() => { refreshOverview(); }, [refreshOverview]);

  const openInWorkbench = useCallback((batch: MigrationBatch) => {
    setHandoffBatch(batch);
    setTab("workbench");
  }, []);

  const openWorkbenchForDataset = useCallback((datasetKey: string) => {
    setPreselectDataset(datasetKey);
    setTab("quick_entry");
  }, []);

  return (
    <ERPPageShell
      title="Data Migration & Opening Balances"
      subtitle="Enter opening balances manually or migrate data from legacy software (myBillBook, Tally, Vyapar…) with staging, validation, reconciliation, and rollback."
    >
      <div className="mb-4"><BusinessSetupLinks /></div>
      {error && <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">{error}</div>}
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === item.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "overview" && overview && <OverviewTab overview={overview} onStartImport={() => setTab("wizard")} onOpenWorkbench={() => setTab("workbench")} onOpenDataset={openWorkbenchForDataset} />}
      {tab === "quick_entry" && <QuickDataEntryWorkbench preselectDataset={preselectDataset} />}
      {tab === "wizard" && overview && <ImportWizard overview={overview} onFinished={refreshOverview} onEditInWorkbench={openInWorkbench} />}
      {tab === "workbench" && overview && <WorkbenchTab overview={overview} handoffBatch={handoffBatch} clearHandoff={() => setHandoffBatch(null)} preselectDataset={preselectDataset} clearPreselect={() => setPreselectDataset(null)} onFinished={refreshOverview} />}
      {tab === "templates" && overview && <TemplatesTab overview={overview} />}
      {tab === "history" && <HistoryTab onChanged={refreshOverview} />}
      {tab === "reconciliation" && <ReconciliationTab />}
      {tab === "readiness" && <ReadinessTab />}
      {tab === "audit" && <AuditTab />}
      {!overview && !error && <div className="py-16 text-center text-sm text-muted-foreground">Loading Migration Center…</div>}
    </ERPPageShell>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

const OPENING_BALANCE_SHORTCUTS: Array<{ key: string; label: string; hint: string }> = [
  { key: "cash_opening_balance", label: "Cash Opening Balance", hint: "Drawers & counters" },
  { key: "bank_opening_balance", label: "Bank Opening Balance", hint: "Bank accounts" },
  { key: "upi_opening_balance", label: "UPI Opening Balance", hint: "PhonePe, GPay, Paytm, BHIM…" },
  { key: "customer_outstanding", label: "Customer Outstanding", hint: "Opening receivables" },
  { key: "vendor_outstanding", label: "Vendor Outstanding", hint: "Opening payables" },
  { key: "opening_stock", label: "Opening Stock", hint: "Warehouse quantities" },
];

function OverviewTab({ overview, onStartImport, onOpenWorkbench, onOpenDataset }: { overview: MigrationOverview; onStartImport: () => void; onOpenWorkbench: () => void; onOpenDataset: (datasetKey: string) => void }) {
  const importable = overview.datasets.filter((d) => d.importable);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Importable Datasets" value={String(importable.length)} />
        <StatCard label="Source Adapters" value={String(overview.sources.length)} />
        <StatCard label="Recent Batches" value={String(overview.recent_batches.length)} />
        <StatCard label="Imported Batches" value={String(overview.recent_batches.filter((b) => b.status === "IMPORTED").length)} />
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-1 text-sm font-semibold text-foreground">Migration pipeline</div>
        <p className="mb-3 text-xs text-muted-foreground">
          Upload → Staging → Validation → Field Mapping → Preview → Duplicate Detection → Approval → Import → Reconciliation → Opening Balance Verification → Business Ready.
          Legacy data never lands directly in production tables. You can upload a file <em>or</em> build the data online in the Data Workbench — no external spreadsheet app needed.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={onStartImport} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Start Import Wizard
          </button>
          <button onClick={onOpenWorkbench} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-ring">
            Open Data Workbench
          </button>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-1 text-sm font-semibold text-foreground">Opening balances & setup</div>
        <p className="mb-3 text-xs text-muted-foreground">
          Enter opening balances manually or in bulk using the Data Workbench — cash, bank, UPI, customer receivables, vendor payables, and stock. All imports are staged, validated against live Finance Accounts and master data, and fully reversible. Click a dataset below to open a blank editable grid.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {OPENING_BALANCE_SHORTCUTS.map((item) => (
            <button
              key={item.key}
              onClick={() => onOpenDataset(item.key)}
              className="flex flex-col items-start rounded-xl border border-border bg-background px-4 py-3 text-left transition hover:border-ring"
            >
              <span className="text-sm font-medium text-foreground">{item.label}</span>
              <span className="text-[11px] text-muted-foreground">{item.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 text-sm font-semibold text-foreground">Recent batches</div>
        {overview.recent_batches.length === 0
          ? <div className="text-sm text-muted-foreground">No migration batches yet.</div>
          : <BatchTable batches={overview.recent_batches} />}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function BatchTable({ batches, actions }: { batches: MigrationBatch[]; actions?: (b: MigrationBatch) => React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3">Batch</th>
            <th className="py-2 pr-3">Dataset</th>
            <th className="py-2 pr-3">Source</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Rows</th>
            <th className="py-2 pr-3">Imported</th>
            <th className="py-2 pr-3">Failed</th>
            <th className="py-2 pr-3">Created</th>
            {actions && <th className="py-2 pr-3">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => (
            <tr key={batch.id} className="border-b border-border/60">
              <td className="py-2 pr-3 font-mono text-xs">{batch.batch_number}</td>
              <td className="py-2 pr-3">{batch.dataset_label}</td>
              <td className="py-2 pr-3 text-xs">{batch.source_type}</td>
              <td className="py-2 pr-3"><StatusBadge status={batch.status} /></td>
              <td className="py-2 pr-3">{batch.total_rows}</td>
              <td className="py-2 pr-3">{batch.imported_rows}</td>
              <td className="py-2 pr-3">{batch.failed_rows}</td>
              <td className="py-2 pr-3 text-xs text-muted-foreground">{new Date(batch.created_at).toLocaleDateString()}</td>
              {actions && <td className="py-2 pr-3">{actions(batch)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Import Wizard ────────────────────────────────────────────────────────────

function ImportWizard({ overview, onFinished, onEditInWorkbench }: { overview: MigrationOverview; onFinished: () => void; onEditInWorkbench: (batch: MigrationBatch) => void }) {
  const importable = overview.datasets.filter((d) => d.importable);
  const [step, setStep] = useState(0);
  const [datasetKey, setDatasetKey] = useState(importable[0]?.key ?? "customers");
  const [sourceType, setSourceType] = useState("MYBILLBOOK");
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<MigrationBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<{ valid: number; warning: number; error: number } | null>(null);
  const [dupRows, setDupRows] = useState<MigrationStagingRow[]>([]);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  const [expectedTotal, setExpectedTotal] = useState("");
  const [reconcileResult, setReconcileResult] = useState<Record<string, unknown> | null>(null);

  const dataset: MigrationDataset | undefined = useMemo(
    () => overview.datasets.find((d) => d.key === (batch?.dataset_key ?? datasetKey)),
    [overview, batch, datasetKey]
  );

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(toErr(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function doUpload() {
    if (!file) { setError("Choose a CSV or XLSX file first."); return; }
    const uploaded = await run(() => uploadMigrationFile(file, datasetKey, sourceType));
    if (uploaded) {
      setBatch(uploaded);
      setMapping(uploaded.mapping ?? {});
      setNotice(`Uploaded as ${uploaded.batch_number} (${uploaded.total_rows} rows staged). ${uploaded.notes ?? ""}`);
      setStep(1);
    }
  }

  async function doSaveMapping() {
    if (!batch) return;
    const updated = await run(() => updateMigrationMapping(batch.id, mapping));
    if (updated) { setBatch(updated); setNotice("Mapping saved."); setStep(2); }
  }

  async function doEditInWorkbench() {
    if (!batch) return;
    const saved = await run(() => updateMigrationMapping(batch.id, mapping));
    if (!saved) return;
    const adopted = await run(() => adoptUploadForEditing(batch.id));
    if (adopted) onEditInWorkbench(adopted);
  }

  async function doValidate() {
    if (!batch) return;
    const result = await run(() => validateMigrationBatch(batch.id));
    if (result) { setCounts(result.counts); setBatch(result.batch); setStep(3); }
  }

  async function doDuplicates() {
    if (!batch) return;
    const result = await run(() => detectMigrationDuplicates(batch.id));
    if (result) {
      setBatch(result.batch);
      const rows = await run(() => getMigrationRows(batch.id, { status: "DUPLICATE", limit: 200 }));
      setDupRows(rows?.rows ?? []);
      setStep(4);
    }
  }

  async function doPreview() {
    if (!batch) return;
    if (dupRows.length) {
      await run(() => setDuplicateResolutions(batch.id, dupRows.map((r) => ({ row_number: r.row_number, resolution: r.duplicate_resolution }))));
    }
    const result = await run(() => previewMigrationBatch(batch.id));
    if (result) { setPreview(result.summary); setBatch(result.batch); setStep(5); }
  }

  async function doExecute() {
    if (!batch) return;
    const result = await run(() => executeMigrationBatch(batch.id, confirmation));
    if (result) {
      setImportResult(result.result);
      setBatch(result.batch);
      setNotice("Import executed.");
      setStep(6);
      onFinished();
    }
  }

  async function doReconcile() {
    if (!batch) return;
    const result = await run(() => reconcileMigrationBatch(batch.id, expectedTotal || undefined));
    if (result) setReconcileResult(result.snapshot as unknown as Record<string, unknown>);
  }

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2">
        {WIZARD_STEPS.map((label, index) => (
          <li key={label} className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${index === step ? "bg-primary text-primary-foreground" : index < step ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
            <span>{index + 1}</span>{label}
          </li>
        ))}
      </ol>
      {notice && <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-600">{error}</div>}

      {step === 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Dataset</span>
              <select value={datasetKey} onChange={(e) => setDatasetKey(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2">
                {importable.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">{dataset?.description}</span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Source software</span>
              <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2">
                {overview.sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <label className="mb-4 block text-sm">
            <span className="mb-1 block font-medium text-foreground">File (CSV or XLSX, up to 50 MB)</span>
            <input type="file" accept=".csv,.xlsx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full rounded-xl border border-dashed border-border bg-background px-3 py-6 text-sm" />
          </label>
          <button disabled={busy} onClick={doUpload} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "Uploading…" : "Upload to Staging"}
          </button>
        </div>
      )}

      {step === 1 && batch && dataset && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-2 text-sm font-semibold text-foreground">Smart field mapping — {batch.batch_number}</div>
          <p className="mb-4 text-xs text-muted-foreground">Detected automatically from column names ({batch.source_type} adapter). Adjust before validation; required fields are marked *.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dataset.fields.map((field) => (
              <label key={field.key} className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-foreground">{field.label}{field.required ? " *" : ""}</span>
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                >
                  <option value="">— not mapped —</option>
                  {(batch.source_headers ?? []).map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={busy} onClick={doSaveMapping} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save Mapping & Continue</button>
            <button disabled={busy} onClick={doEditInWorkbench} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:border-ring disabled:opacity-50" title="Open the uploaded rows in the online editable grid">
              Edit rows in Data Workbench
            </button>
          </div>
        </div>
      )}

      {step === 2 && batch && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-2 text-sm font-semibold text-foreground">Validation — {batch.batch_number}</div>
          <p className="mb-4 text-xs text-muted-foreground">Checks mandatory fields, formats (mobile, GSTIN, PAN, PIN, dates, amounts), and cross-references against master data. No data is imported during validation.</p>
          <button disabled={busy} onClick={doValidate} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Validating…" : "Run Validation"}</button>
        </div>
      )}

      {step === 3 && batch && counts && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Valid rows" value={String(counts.valid)} />
            <StatCard label="Warnings" value={String(counts.warning)} />
            <StatCard label="Errors (will not import)" value={String(counts.error)} />
          </div>
          {counts.error > 0 && (
            <button onClick={() => downloadMigrationFile(migrationErrorReportUrl(batch.id), `${batch.batch_number}_errors.csv`)} className="rounded-xl border border-border px-4 py-2 text-sm font-medium">
              Download Error Report
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="rounded-xl border border-border px-4 py-2 text-sm">Back to Mapping</button>
            <button disabled={busy} onClick={doDuplicates} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Detect Duplicates</button>
          </div>
        </div>
      )}

      {step === 4 && batch && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-2 text-sm font-semibold text-foreground">Duplicate detection — {batch.duplicate_rows} found</div>
          {dupRows.length === 0
            ? <p className="mb-4 text-sm text-muted-foreground">No duplicates against production or within the file.</p>
            : (
              <div className="mb-4 max-h-96 overflow-auto rounded-xl border border-border">
                <table className="w-full min-w-[560px] text-xs">
                  <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-2">Row</th><th className="p-2">Matched On</th><th className="p-2">Resolution</th></tr></thead>
                  <tbody>
                    {dupRows.map((row) => (
                      <tr key={row.row_number} className="border-b border-border/60">
                        <td className="p-2">#{row.row_number}</td>
                        <td className="p-2">{row.duplicate_matches.map((m, i) => <div key={i}>{String(m.field)}: {String(m.value)} ({String(m.scope)})</div>)}</td>
                        <td className="p-2">
                          <select
                            value={row.duplicate_resolution}
                            onChange={(e) => setDupRows((prev) => prev.map((r) => r.row_number === row.row_number ? { ...r, duplicate_resolution: e.target.value } : r))}
                            className="rounded-lg border border-border bg-background px-2 py-1"
                          >
                            <option value="SKIP">Skip</option>
                            <option value="MERGE">Merge (fill blanks)</option>
                            <option value="UPDATE">Update existing</option>
                            <option value="CREATE_NEW">Create new</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <button disabled={busy} onClick={doPreview} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Build Import Preview</button>
        </div>
      )}

      {step === 5 && batch && preview && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Will import" value={String(preview.will_import ?? 0)} />
            <StatCard label="Errors excluded" value={String(preview.errors ?? 0)} />
            <StatCard label="Duplicates skipped" value={String(preview.duplicates_skip ?? 0)} />
            {preview.total_amount != null && <StatCard label="Total amount" value={`₹${preview.total_amount}`} />}
          </div>
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
            <div className="mb-2 text-sm font-semibold text-foreground">Approval required — nothing has been committed yet</div>
            <p className="mb-3 text-xs text-muted-foreground">Type <span className="font-mono font-semibold">IMPORT</span> to approve and execute batch {batch.batch_number}. Each row imports in its own transaction; the batch can be rolled back afterwards.</p>
            <div className="flex flex-wrap gap-2">
              <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder='Type "IMPORT"' className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              <button disabled={busy || confirmation.trim().toUpperCase() !== "IMPORT"} onClick={doExecute} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {busy ? "Importing…" : "Approve & Execute Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 6 && batch && (
        <div className="space-y-4">
          {importResult && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Imported" value={String(importResult.imported ?? 0)} />
              <StatCard label="Skipped" value={String(importResult.skipped ?? 0)} />
              <StatCard label="Failed" value={String(importResult.failed ?? 0)} />
              <StatCard label="Duration (s)" value={String(Number(importResult.duration_seconds ?? 0).toFixed(1))} />
            </div>
          )}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-2 text-sm font-semibold text-foreground">Reconciliation — {batch.batch_number}</div>
            <p className="mb-3 text-xs text-muted-foreground">Enter the expected total from the legacy software (e.g. total outstanding, total opening balance). Business cannot Go Live until differences are resolved.</p>
            <div className="mb-3 flex flex-wrap gap-2">
              <input value={expectedTotal} onChange={(e) => setExpectedTotal(e.target.value)} placeholder="Expected total (₹)" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              <button disabled={busy} onClick={doReconcile} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Reconcile</button>
            </div>
            {reconcileResult && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${reconcileResult.matched ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-amber-500/40 bg-amber-500/10 text-amber-700"}`}>
                Imported total: ₹{String(reconcileResult.imported_total ?? "—")} · Expected: ₹{String(reconcileResult.expected_total ?? "—")} · Difference: ₹{String(reconcileResult.difference ?? "—")} · {reconcileResult.matched ? "MATCHED ✓" : "DIFFERENCE FOUND — resolve before Go Live"}
              </div>
            )}
          </div>
          <button onClick={() => { setStep(0); setBatch(null); setFile(null); setCounts(null); setPreview(null); setImportResult(null); setReconcileResult(null); setConfirmation(""); setNotice(null); }} className="rounded-xl border border-border px-4 py-2 text-sm">
            Start Another Import
          </button>
        </div>
      )}
    </div>
  );
}

// ── Data Workbench (in-webapp editable grid) ─────────────────────────────────

type EditableRow = { rowNumber?: number; values: Record<string, string>; status?: string; errors?: string[]; warnings?: string[] };

function WorkbenchTab({ overview, handoffBatch, clearHandoff, preselectDataset, clearPreselect, onFinished }: { overview: MigrationOverview; handoffBatch: MigrationBatch | null; clearHandoff: () => void; preselectDataset: string | null; clearPreselect: () => void; onFinished: () => void }) {
  const importable = overview.datasets.filter((d) => d.importable);
  const [datasetKey, setDatasetKey] = useState(importable[0]?.key ?? "customers");
  const [batch, setBatch] = useState<MigrationBatch | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<"form" | "grid">("form");
  const [phase, setPhase] = useState<"edit" | "import">("edit");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);

  const dataset: MigrationDataset | undefined = useMemo(
    () => overview.datasets.find((d) => d.key === (batch?.dataset_key ?? datasetKey)),
    [overview, batch, datasetKey]
  );

  const loadRows = useCallback(async (batchId: number) => {
    const res = await getMigrationRows(batchId, { limit: 500 });
    setRows(res.rows.map((r) => ({ rowNumber: r.row_number, values: { ...r.mapped_data } as Record<string, string>, status: r.status, errors: r.errors, warnings: r.warnings })));
  }, []);

  // Accept a batch handed off from the Import Wizard (adopted upload).
  useEffect(() => {
    if (handoffBatch) {
      setBatch(handoffBatch);
      setDatasetKey(handoffBatch.dataset_key);
      setPhase("edit");
      setPreview(null);
      setImportResult(null);
      void loadRows(handoffBatch.id).catch((e) => setError(toErr(e)));
      setNotice(`Opened ${handoffBatch.batch_number} (${handoffBatch.total_rows} rows) for online editing.`);
      clearHandoff();
    }
  }, [handoffBatch, clearHandoff, loadRows]);

  // Preselect a dataset when arriving from an opening-balance shortcut.
  useEffect(() => {
    if (preselectDataset) {
      setDatasetKey(preselectDataset);
      setBatch(null);
      setRows([]);
      clearPreselect();
    }
  }, [preselectDataset, clearPreselect]);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(toErr(e)); return undefined; } finally { setBusy(false); }
  }

  async function startNew() {
    const created = await run(() => createWorkbenchBatch(datasetKey));
    if (created) {
      setBatch(created);
      setRows([{ values: {} }, { values: {} }, { values: {} }]);
      setPhase("edit"); setPreview(null); setImportResult(null);
      setNotice(`New workbench ${created.batch_number} for ${created.dataset_label}. Fill in rows below.`);
    }
  }

  function setCell(index: number, key: string, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, values: { ...r.values, [key]: value } } : r)));
  }
  function addBlankRow() { setRows((prev) => [...prev, { values: {} }]); }
  function removeRow(index: number) { setRows((prev) => prev.filter((_, i) => i !== index)); }

  async function saveAndValidate() {
    if (!batch) return;
    const payload = rows.map((r) => r.values).filter((v) => Object.values(v).some((x) => (x ?? "").trim() !== ""));
    const res = await run(() => bulkSetWorkbenchRows(batch.id, payload));
    if (res) {
      setBatch(res.batch);
      await loadRows(batch.id);
      setNotice(`Saved & validated: ${res.batch.valid_rows} valid, ${res.batch.warning_rows} warning, ${res.batch.error_rows} error.`);
    }
  }

  async function saveQuickEntry(values: Record<string, string>) {
    if (!batch) return;
    const res = await run(() => addWorkbenchRow(batch.id, values));
    if (res) {
      setBatch(res.batch);
      await loadRows(batch.id);
      setNotice(`Row added. Batch totals: ${res.batch.valid_rows} valid, ${res.batch.warning_rows} warning, ${res.batch.error_rows} error.`);
    }
  }

  async function proceedToImport() {
    if (!batch) return;
    await run(() => detectMigrationDuplicates(batch.id));
    const res = await run(() => previewMigrationBatch(batch.id));
    if (res) { setPreview(res.summary); setBatch(res.batch); setPhase("import"); }
  }

  async function doExecute() {
    if (!batch) return;
    const res = await run(() => executeMigrationBatch(batch.id, confirmation));
    if (res) { setImportResult(res.result); setBatch(res.batch); setNotice("Import executed from workbench."); onFinished(); }
  }

  async function doDeleteBatch() {
    if (!batch) return;
    if (!window.confirm(`Delete workbench batch ${batch.batch_number} and all its rows? This cannot be undone.`)) return;
    const res = await run(() => deleteMigrationBatch(batch.id));
    if (res) { setBatch(null); setRows([]); setPreview(null); setImportResult(null); setNotice(`Deleted ${batch.batch_number}.`); onFinished(); }
  }

  return (
    <div className="space-y-4">
      {notice && <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-600">{error}</div>}

      {!batch && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-1 text-sm font-semibold text-foreground">Data Workbench</div>
          <p className="mb-3 text-xs text-muted-foreground">Build migration data online — customers, vendors, products, inventory, outstanding, and all opening balances. Add, edit, and delete rows in the grid, validate against your live Business Setup (COA, finance accounts, branches, products), then import. No third-party spreadsheet needed.</p>
          {(datasetKey === "cash_opening_balance" || datasetKey === "bank_opening_balance" || datasetKey === "upi_opening_balance") && (
            <div className="mb-3 rounded-xl border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs text-foreground">
              <strong>Finance account opening balance:</strong> In the <em>account</em> field, enter the exact name of your {datasetKey === "cash_opening_balance" ? "Cash" : datasetKey === "bank_opening_balance" ? "Bank" : "UPI"} finance account as set up in Business Setup → Finance Accounts. One row per account.
            </div>
          )}
          {datasetKey === "vendor_outstanding" && (
            <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-foreground">
              <strong>Vendor outstanding:</strong> In the <em>vendor</em> field, enter the exact vendor name as registered in your Vendor list. Unrecognised vendor names will produce a validation warning; create the vendor first if needed.
            </div>
          )}
          {datasetKey === "customer_outstanding" && (
            <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-foreground">
              <strong>Customer outstanding:</strong> Enter the customer name and outstanding amount. These are legacy receivables — use Finance Collection to mark them as paid when the customer settles.
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Dataset</span>
              <select value={datasetKey} onChange={(e) => setDatasetKey(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2">
                {importable.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
            <button disabled={busy} onClick={startNew} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Open Workbench</button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">{dataset?.description}</div>
        </div>
      )}

      {batch && dataset && phase === "edit" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold text-foreground">{dataset.label} — <span className="font-mono">{batch.batch_number}</span></div>
              <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
                <button onClick={() => setEntryMode("form")} className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${entryMode === "form" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Quick Entry</button>
                <button onClick={() => setEntryMode("grid")} className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${entryMode === "grid" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Data Grid</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-600">{batch.valid_rows} valid</span>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600">{batch.warning_rows} warning</span>
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-red-600">{batch.error_rows} error</span>
            </div>
          </div>
          
          {entryMode === "form" ? (
            <div className="space-y-6">
              <WorkbenchQuickEntryForm dataset={dataset} onSaveAndAddAnother={saveQuickEntry} busy={busy} />
              
              {rows.length > 0 && (
                <div className="rounded-2xl border border-border bg-card">
                  <div className="border-b border-border bg-muted/40 px-5 py-3 text-sm font-medium text-foreground">Recently Added ({rows.length})</div>
                  <div className="max-h-[300px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/50 text-left">
                          <th className="p-3 font-medium text-muted-foreground">#</th>
                          {dataset.fields.map((f) => <th key={f.key} className="p-3 font-medium text-muted-foreground whitespace-nowrap">{f.label}</th>)}
                          <th className="p-3 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice().reverse().map((row, idx) => (
                          <tr key={idx} className={`border-b border-border/30 ${row.status === "ERROR" ? "bg-red-500/5" : ""}`}>
                            <td className="p-3 text-muted-foreground">{rows.length - idx}</td>
                            {dataset.fields.map((f) => <td key={f.key} className="p-3">{row.values[f.key] ?? "-"}</td>)}
                            <td className="p-3">
                              {row.status && <span className={`rounded px-1.5 py-0.5 ${row.status === "ERROR" ? "bg-red-500/15 text-red-600" : row.status === "WARNING" ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`} title={(row.errors ?? []).concat(row.warnings ?? []).join(" | ")}>{row.status}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              <div className="flex flex-wrap gap-2 pt-2">
                <button disabled={busy || batch.valid_rows + batch.warning_rows === 0 || batch.error_rows > 0} onClick={proceedToImport} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" title={batch.error_rows > 0 ? "Fix all errors first" : ""}>Validate & Proceed to Import</button>
                <button onClick={() => { setBatch(null); setRows([]); setNotice(null); }} className="rounded-xl border border-border px-4 py-2 text-sm">Close Workbench</button>
                <button disabled={busy} onClick={doDeleteBatch} className="ml-auto rounded-xl border border-red-500/40 px-4 py-2 text-sm text-red-600 disabled:opacity-50">Delete Batch</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      <th className="p-2 font-medium text-muted-foreground">#</th>
                      {dataset.fields.map((f) => <th key={f.key} className="p-2 font-medium text-muted-foreground whitespace-nowrap">{f.label}{f.required ? " *" : ""}</th>)}
                      <th className="p-2 font-medium text-muted-foreground">Status</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index} className={`border-b border-border/50 ${row.status === "ERROR" ? "bg-red-500/5" : ""}`}>
                        <td className="p-1 text-muted-foreground">{index + 1}</td>
                        {dataset.fields.map((f) => (
                          <td key={f.key} className="p-1">
                            {f.choices && f.choices.length > 0 ? (
                              <select value={row.values[f.key] ?? ""} onChange={(e) => setCell(index, f.key, e.target.value)} className="w-full min-w-[90px] rounded border border-border bg-background px-1.5 py-1">
                                <option value=""></option>
                                {f.choices.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            ) : (
                              <input
                                value={row.values[f.key] ?? ""}
                                onChange={(e) => setCell(index, f.key, e.target.value)}
                                className="w-full min-w-[110px] rounded border border-border bg-background px-1.5 py-1"
                                aria-label={`${f.label} row ${index + 1}`}
                              />
                            )}
                          </td>
                        ))}
                        <td className="p-1 whitespace-nowrap">
                          {row.status && <span className={`rounded px-1.5 py-0.5 ${row.status === "ERROR" ? "bg-red-500/15 text-red-600" : row.status === "WARNING" ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`} title={(row.errors ?? []).concat(row.warnings ?? []).join(" | ")}>{row.status}</span>}
                        </td>
                        <td className="p-1"><button onClick={() => removeRow(index)} className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-500/10" aria-label={`Delete row ${index + 1}`}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.some((r) => r.errors && r.errors.length > 0) && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs text-red-600">
                  {rows.filter((r) => r.errors && r.errors.length).slice(0, 6).map((r, i) => <div key={i}>Row {(r.rowNumber ?? 0)}: {(r.errors ?? []).join("; ")}</div>)}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button onClick={addBlankRow} className="rounded-xl border border-border px-4 py-2 text-sm font-medium">+ Add Row</button>
                <button disabled={busy} onClick={saveAndValidate} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save & Validate"}</button>
                <button disabled={busy || batch.valid_rows + batch.warning_rows === 0 || batch.error_rows > 0} onClick={proceedToImport} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" title={batch.error_rows > 0 ? "Fix all errors first" : ""}>Validate & Proceed to Import</button>
                <button onClick={() => { setBatch(null); setRows([]); setNotice(null); }} className="rounded-xl border border-border px-4 py-2 text-sm">Close</button>
                <button disabled={busy} onClick={doDeleteBatch} className="ml-auto rounded-xl border border-red-500/40 px-4 py-2 text-sm text-red-600 disabled:opacity-50">Delete Batch</button>
              </div>
            </div>
          )}
        </div>
      )}

      {batch && phase === "import" && preview && !importResult && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Will import" value={String(preview.will_import ?? 0)} />
            <StatCard label="Errors excluded" value={String(preview.errors ?? 0)} />
            <StatCard label="Duplicates skipped" value={String(preview.duplicates_skip ?? 0)} />
            {preview.total_amount != null && <StatCard label="Total amount" value={`₹${preview.total_amount}`} />}
          </div>
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
            <div className="mb-2 text-sm font-semibold text-foreground">Approve import — nothing committed yet</div>
            <p className="mb-3 text-xs text-muted-foreground">Type <span className="font-mono font-semibold">IMPORT</span> to commit workbench batch {batch.batch_number} to production.</p>
            <div className="flex flex-wrap gap-2">
              <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder='Type "IMPORT"' className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              <button disabled={busy || confirmation.trim().toUpperCase() !== "IMPORT"} onClick={doExecute} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Importing…" : "Approve & Execute"}</button>
              <button onClick={() => setPhase("edit")} className="rounded-xl border border-border px-4 py-2 text-sm">Back to Editing</button>
            </div>
          </div>
        </div>
      )}

      {importResult && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Imported" value={String(importResult.imported ?? 0)} />
            <StatCard label="Skipped" value={String(importResult.skipped ?? 0)} />
            <StatCard label="Failed" value={String(importResult.failed ?? 0)} />
          </div>
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
            Workbench batch {batch?.batch_number} imported. Verify totals in the Reconciliation tab, then check Business Readiness before Go Live.
          </div>
          <button onClick={() => { setBatch(null); setRows([]); setPreview(null); setImportResult(null); setConfirmation(""); setPhase("edit"); }} className="rounded-xl border border-border px-4 py-2 text-sm">New Workbench</button>
        </div>
      )}
    </div>
  );
}

// ── Templates ────────────────────────────────────────────────────────────────

function TemplatesTab({ overview }: { overview: MigrationOverview }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-1 text-sm font-semibold text-foreground">Download import templates</div>
      <p className="mb-4 text-xs text-muted-foreground">Fill these in from your legacy software export, then upload through the Import Wizard.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {overview.datasets.map((dataset) => (
          <div key={dataset.key} className="rounded-xl border border-border bg-background p-4">
            <div className="text-sm font-medium text-foreground">{dataset.label}</div>
            <div className="mb-3 text-[11px] text-muted-foreground">{dataset.importable ? "Importable via wizard" : "Template only — import via its master screen"}</div>
            <div className="flex gap-2">
              <button onClick={() => downloadMigrationFile(migrationTemplateUrl(dataset.key, "csv"), `${dataset.key}_template.csv`)} className="rounded-lg border border-border px-3 py-1 text-xs font-medium">CSV</button>
              <button onClick={() => downloadMigrationFile(migrationTemplateUrl(dataset.key, "xlsx"), `${dataset.key}_template.xlsx`)} className="rounded-lg border border-border px-3 py-1 text-xs font-medium">XLSX</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────────

function HistoryTab({ onChanged }: { onChanged: () => void }) {
  const [batches, setBatches] = useState<MigrationBatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<MigrationBatch | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listMigrationBatches().then((r) => setBatches(r.batches)).catch((e) => setError(toErr(e)));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function doRollback() {
    if (!rollbackTarget) return;
    setBusy(true);
    setError(null);
    try {
      const result = await rollbackMigrationBatch(rollbackTarget.id, confirmation);
      setNotice(`Rolled back ${String((result.result as { rolled_back?: number }).rolled_back ?? 0)} row(s) of ${rollbackTarget.batch_number}.`);
      setRollbackTarget(null);
      setConfirmation("");
      refresh();
      onChanged();
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(false); }
  }

  async function doDelete(batch: MigrationBatch) {
    if (!window.confirm(`Delete batch ${batch.batch_number} and its staging rows? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMigrationBatch(batch.id);
      setNotice(`Deleted ${batch.batch_number}.`);
      refresh();
      onChanged();
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {notice && <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-600">{error}</div>}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 text-sm font-semibold text-foreground">Import history</div>
        {batches.length === 0 ? <div className="text-sm text-muted-foreground">No batches yet.</div> : (
          <BatchTable
            batches={batches}
            actions={(batch) => (
              <div className="flex gap-2">
                {(batch.failed_rows > 0 || batch.error_rows > 0 || batch.duplicate_rows > 0) && (
                  <button onClick={() => downloadMigrationFile(migrationErrorReportUrl(batch.id), `${batch.batch_number}_errors.csv`)} className="rounded-lg border border-border px-2 py-1 text-[11px]">Errors CSV</button>
                )}
                {["IMPORTED", "PARTIALLY_IMPORTED", "FAILED"].includes(batch.status) && batch.imported_rows > 0 && (
                  <button onClick={() => { setRollbackTarget(batch); setConfirmation(""); }} className="rounded-lg border border-red-500/40 px-2 py-1 text-[11px] text-red-600">Rollback</button>
                )}
                {batch.imported_rows === 0 && (
                  <button disabled={busy} onClick={() => doDelete(batch)} className="rounded-lg border border-red-500/40 px-2 py-1 text-[11px] text-red-600 disabled:opacity-50">Delete</button>
                )}
              </div>
            )}
          />
        )}
      </div>
      {rollbackTarget && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5">
          <div className="mb-2 text-sm font-semibold text-foreground">Roll back {rollbackTarget.batch_number}?</div>
          <p className="mb-3 text-xs text-muted-foreground">
            This removes only records created by this migration batch ({rollbackTarget.imported_rows} imported row(s)) and restores updated opening balances to their prior values. Manually created business data is never touched. Type <span className="font-mono font-semibold">ROLLBACK</span> to confirm.
          </p>
          <div className="flex flex-wrap gap-2">
            <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder='Type "ROLLBACK"' className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <button disabled={busy || confirmation.trim().toUpperCase() !== "ROLLBACK"} onClick={doRollback} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Rolling back…" : "Confirm Rollback"}</button>
            <button onClick={() => setRollbackTarget(null)} className="rounded-xl border border-border px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reconciliation ───────────────────────────────────────────────────────────

function ReconciliationTab() {
  const [data, setData] = useState<{ batches: Array<Record<string, unknown>>; all_resolved: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getMigrationReconciliation().then(setData).catch((e) => setError(toErr(e)));
  }, []);
  if (error) return <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-5 text-sm font-semibold ${data.all_resolved ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-amber-500/40 bg-amber-500/10 text-amber-700"}`}>
        {data.all_resolved ? "All migration reconciliations are resolved." : "Unresolved reconciliation differences exist — Go Live is blocked until they are resolved."}
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 text-sm font-semibold text-foreground">Batch reconciliation</div>
        {data.batches.length === 0 ? <div className="text-sm text-muted-foreground">No imported batches to reconcile yet.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pr-3">Batch</th><th className="py-2 pr-3">Dataset</th><th className="py-2 pr-3">Expected</th><th className="py-2 pr-3">Imported</th><th className="py-2 pr-3">Difference</th><th className="py-2 pr-3">Failed Rows</th><th className="py-2 pr-3">State</th></tr></thead>
              <tbody>
                {data.batches.map((entry, index) => {
                  const snapshot = (entry.snapshot ?? {}) as Record<string, unknown>;
                  return (
                    <tr key={index} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-mono text-xs">{String(entry.batch_number)}</td>
                      <td className="py-2 pr-3">{String(entry.dataset)}</td>
                      <td className="py-2 pr-3">{snapshot.expected_total != null ? `₹${String(snapshot.expected_total)}` : "—"}</td>
                      <td className="py-2 pr-3">{snapshot.imported_total != null ? `₹${String(snapshot.imported_total)}` : "—"}</td>
                      <td className="py-2 pr-3">{snapshot.difference != null ? `₹${String(snapshot.difference)}` : "—"}</td>
                      <td className="py-2 pr-3">{String(entry.failed_rows ?? 0)}</td>
                      <td className="py-2 pr-3">{entry.unresolved ? <span className="text-amber-600">UNRESOLVED</span> : <span className="text-emerald-600">OK</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Readiness ────────────────────────────────────────────────────────────────

function ReadinessTab() {
  const [data, setData] = useState<BusinessReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getBusinessReadiness().then(setData).catch((e) => setError(toErr(e)));
  }, []);
  if (error) return <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-5 ${data.ready_for_go_live ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
        <div className="text-sm font-semibold text-foreground">{data.ready_for_go_live ? "READY FOR GO LIVE ✓" : "Not ready for Go Live yet"}</div>
        <div className="mt-1 text-xs text-muted-foreground">Core setup status: {data.core_overall_status}. Mandatory checklist items and reconciliation must pass; migration items are optional if you are starting fresh without legacy data.</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((item) => (
          <div key={item.key} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${item.ready ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card"}`}>
            <span className="text-foreground">{item.label}{item.optional ? <span className="ml-1 text-[10px] text-muted-foreground">(optional)</span> : null}</span>
            <span className={item.ready ? "text-emerald-600" : "text-muted-foreground"}>{item.ready ? "✓" : "…"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Audit ────────────────────────────────────────────────────────────────────

function AuditTab() {
  const [logs, setLogs] = useState<Array<{ id: number; action: string; batch_number: string | null; actor: string | null; created_at: string; payload: Record<string, unknown> }>>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getMigrationAuditLog().then((r) => setLogs(r.logs)).catch((e) => setError(toErr(e)));
  }, []);
  if (error) return <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">{error}</div>;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 text-sm font-semibold text-foreground">Migration audit log</div>
      {logs.length === 0 ? <div className="text-sm text-muted-foreground">No migration actions recorded yet.</div> : (
        <div className="max-h-[32rem] space-y-2 overflow-auto">
          {logs.map((log) => (
            <div key={log.id} className="rounded-xl border border-border/60 bg-background px-4 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">{log.action}</span>
                {log.batch_number && <span className="font-mono text-muted-foreground">{log.batch_number}</span>}
                <span className="text-muted-foreground">by {log.actor ?? "system"}</span>
                <span className="ml-auto text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
              </div>
              {Object.keys(log.payload ?? {}).length > 0 && (
                <div className="mt-1 truncate text-muted-foreground">{JSON.stringify(log.payload)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkbenchQuickEntryForm({
  dataset,
  onSaveAndAddAnother,
  busy,
}: {
  dataset: MigrationDataset;
  onSaveAndAddAnother: (values: Record<string, string>) => Promise<void>;
  busy: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    void onSaveAndAddAnother(values).then(() => setValues({}));
  }

  return (
    <form onSubmit={handleSave} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 text-sm font-semibold text-foreground">New Record</div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {dataset.fields.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{f.label}{f.required && <span className="ml-1 text-red-500">*</span>}</span>
            {f.choices && f.choices.length > 0 ? (
              <select
                required={f.required}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm shadow-sm transition hover:border-ring focus:border-ring focus:ring-1 focus:ring-ring"
              >
                <option value=""></option>
                {f.choices.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input
                required={f.required}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm shadow-sm transition hover:border-ring focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder={`Enter ${f.label.toLowerCase()}`}
              />
            )}
          </label>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-end gap-3 border-t border-border/50 pt-5">
        <button
          type="button"
          onClick={() => setValues({})}
          className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save & Add Another"}
        </button>
      </div>
    </form>
  );
}
