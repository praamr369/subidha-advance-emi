"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ActionButton from "@/components/ui/ActionButton";
import { ROUTES } from "@/lib/routes";
import { normalizeApiError } from "@/services/api";
import {
  createReconciliationRun,
  getReconciliationModules,
  listReconciliationItems,
  listReconciliationRuns,
} from "@/services/reconciliation/control-tower";
import type { ReconciliationItem, ReconciliationModuleSummary, ReconciliationRun } from "@/types/reconciliation";

const TODAY = new Date().toISOString().slice(0, 10);
const DEFAULT_FROM = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

function boxClass(tone: "neutral" | "success" | "warning" | "danger" = "neutral") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-900";
  return "border-border bg-card text-foreground";
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "success" | "warning" | "danger" }) {
  return <div className={`rounded-2xl border p-4 shadow-sm ${boxClass(tone)}`}><div className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
}

function actionHrefFor(item: ReconciliationItem): string {
  if (item.action_href) return item.action_href;
  const code = (item.exception_code || "").toUpperCase();
  if (code.includes("BRIDGE") || code.includes("JOURNAL") || code.includes("POSTING")) return "/admin/accounting/bridge-reconciliation";
  if (code.includes("MAPPING") || code.includes("COA")) return "/admin/accounting/setup/mapping-audit";
  if (code.includes("PERIOD")) return ROUTES.admin.accountingPeriods;
  return "/admin/reconciliation/runs";
}

export default function AdminReconciliationRunsPage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ReconciliationRun | null>(null);
  const [modules, setModules] = useState<ReconciliationModuleSummary[]>([]);
  const [exceptions, setExceptions] = useState<ReconciliationItem[]>([]);
  const [dateFrom, setDateFrom] = useState(DEFAULT_FROM);
  const [dateTo, setDateTo] = useState(TODAY);
  const [financialYear, setFinancialYear] = useState("");
  const [accountingPeriod, setAccountingPeriod] = useState("");

  const loadRunDetails = useCallback(async (run: ReconciliationRun | null) => {
    setSelectedRun(run);
    if (!run) {
      setModules([]);
      setExceptions([]);
      return;
    }
    const [modulePayload, itemPayload] = await Promise.all([
      getReconciliationModules(run.id),
      listReconciliationItems({ run: run.id }),
    ]);
    setModules(modulePayload.results || []);
    setExceptions(itemPayload.results || []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await listReconciliationRuns();
      const rows = payload.results || [];
      setRuns(rows);
      await loadRunDetails(selectedRun ? rows.find((row) => row.id === selectedRun.id) ?? rows[0] ?? null : rows[0] ?? null);
    } catch (e) {
      setError(normalizeApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, [loadRunDetails, selectedRun]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function runChecks() {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const run = await createReconciliationRun({
        scope: "PHASE_F",
        module: "CONTROL_TOWER",
        date_from: dateFrom || null,
        date_to: dateTo || null,
        financial_year: financialYear || null,
        accounting_period: accountingPeriod || null,
      });
      setNotice(`Run #${run.run_no} completed. Checks: ${run.total_checked}; exceptions: ${run.total_exceptions}.`);
      const payload = await listReconciliationRuns();
      setRuns(payload.results || []);
      await loadRunDetails(run);
    } catch (e) {
      setError(normalizeApiError(e).message);
    } finally {
      setRunning(false);
    }
  }

  const warningCount = selectedRun ? Math.max(0, selectedRun.total_exceptions - selectedRun.high_risk_count) : 0;
  const passedCount = selectedRun ? Math.max(0, selectedRun.total_matched) : 0;
  const moduleTotals = useMemo(() => modules.reduce((sum, row) => sum + row.open_count, 0), [modules]);

  return (
    <ERPPageShell
      title="Reconciliation Runs"
      subtitle="Run read-only accounting checks, review module summaries, and route exceptions to mapping audit, bridge reconciliation, or accounting periods."
      actions={[{ href: "/admin/accounting/setup/mapping-audit", label: "Mapping Audit", variant: "secondary" }, { href: "/admin/accounting/bridge-reconciliation", label: "Bridge Reconciliation", variant: "secondary" }, { href: ROUTES.admin.accountingPeriods, label: "Accounting Periods", variant: "secondary" }]}
      statusBadge={{ label: selectedRun?.status || "No run selected", tone: selectedRun?.status === "COMPLETED" ? "success" : "warning" }}
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading reconciliation runs..." /> : null}
        {error ? <ERPErrorState title="Reconciliation run failed" description={error} onRetry={() => void load()} /> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}

        <ERPSectionShell title="Run checks" description="Checks are synchronous and read-only. They do not auto-correct, auto-post, or allocate document numbers.">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">From date</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">To date</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financial year</span><input value={financialYear} onChange={(event) => setFinancialYear(event.target.value)} placeholder="FY code or ID" className="w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting period</span><input value={accountingPeriod} onChange={(event) => setAccountingPeriod(event.target.value)} placeholder="Period code or ID" className="w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
            <div className="flex items-end"><ActionButton variant="primary" onClick={() => void runChecks()} disabled={running}>{running ? "Running..." : "Run checks"}</ActionButton></div>
          </div>
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-950">Read-only guarantee: this page does not create JournalEntry, DocumentSequence, Payment, ReceiptDocument, source records, or posting bridge rows.</div>
        </ERPSectionShell>

        <section className="grid gap-3 md:grid-cols-6">
          <Stat label="Run ID" value={selectedRun ? `#${selectedRun.run_no}` : "—"} />
          <Stat label="Total checks" value={selectedRun?.total_checked ?? 0} />
          <Stat label="Passed" value={passedCount} tone="success" />
          <Stat label="Warnings" value={warningCount} tone="warning" />
          <Stat label="Errors" value={selectedRun?.high_risk_count ?? 0} tone={(selectedRun?.high_risk_count ?? 0) > 0 ? "danger" : "success"} />
          <Stat label="Module open" value={moduleTotals} tone={moduleTotals > 0 ? "warning" : "success"} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <ERPSectionShell title="Run history" description="Select a run to inspect summaries and exceptions.">
            <div className="max-h-[30rem] overflow-auto rounded-2xl border border-border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Run</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Exceptions</th><th className="px-4 py-3">Started</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {runs.map((run) => <tr key={run.id} className={selectedRun?.id === run.id ? "bg-amber-50" : "hover:bg-muted/30"}><td className="px-4 py-3"><button type="button" onClick={() => void loadRunDetails(run)} className="font-semibold hover:underline">#{run.run_no}</button><div className="text-xs text-muted-foreground">{run.scope}</div></td><td className="px-4 py-3">{run.status}</td><td className="px-4 py-3 text-right">{run.total_exceptions}</td><td className="px-4 py-3 text-xs text-muted-foreground">{run.started_at}</td></tr>)}
                  {!runs.length ? <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No runs yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </ERPSectionShell>

          <ERPSectionShell title="Selected run summary" description="Selected run context, module summaries, and read-only output.">
            {selectedRun ? <div className="space-y-4"><div className="rounded-2xl border border-border bg-card p-4 text-sm"><div className="font-semibold text-foreground">Run #{selectedRun.run_no}</div><div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2"><div>Date range: {selectedRun.date_from || "—"} → {selectedRun.date_to || "—"}</div><div>Financial year: {selectedRun.financial_year || "Backend resolved"}</div><div>Accounting period: {selectedRun.accounting_period || "Backend resolved"}</div><div>Created by: {selectedRun.started_by_username || selectedRun.started_by}</div></div></div><div className="grid gap-3 md:grid-cols-2">{modules.map((row) => <div key={row.module} className="rounded-2xl border border-border bg-card p-4 text-sm"><div className="flex items-center justify-between"><div className="font-semibold text-foreground">{row.module}</div><span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950">Open {row.open_count}</span></div><div className="mt-1 text-xs text-muted-foreground">High risk: {row.high_risk_count}</div>{row.exception_codes?.length ? <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted-foreground">{row.exception_codes.map((item) => <span key={`${row.module}-${item.exception_code}`} className="rounded-full border border-border px-2 py-1">{item.exception_code}: {item.count}</span>)}</div> : null}</div>)}</div></div> : <div className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Select or run a reconciliation.</div>}
          </ERPSectionShell>
        </div>

        <ERPSectionShell title="Exception table" description="No correction happens from this page. Use action links to open the correct operational page.">
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Severity</th><th className="px-4 py-3">Module</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Action</th></tr></thead>
              <tbody className="divide-y divide-border">
                {exceptions.map((item) => <tr key={item.id} className="align-top"><td className="px-4 py-3 font-mono text-xs">{item.exception_code || item.status}</td><td className="px-4 py-3">{item.severity}</td><td className="px-4 py-3">{item.module}</td><td className="px-4 py-3 text-xs text-muted-foreground">{item.source_type} #{item.source_id}<div>{item.source_label}</div></td><td className="px-4 py-3 text-xs text-muted-foreground">{item.exception_message || item.recommended_action}</td><td className="px-4 py-3"><Link href={actionHrefFor(item)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Open action</Link></td></tr>)}
                {!exceptions.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No exceptions for the selected run.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
