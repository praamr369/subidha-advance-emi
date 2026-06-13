"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import { ROUTES } from "@/lib/routes";
import { generateCurrentAccountingPeriod } from "@/services/accounting-period-actions";
import { getAccountingBridgeReconciliation, type AccountingBridgeReconciliationSummary } from "@/services/accounting-bridge-reconciliation";
import { seedSupportedAccountingMappings } from "@/services/accounting-mapping-remediation";
import {
  activateFinancialYear,
  closeAccountingPeriod,
  createFinancialYear,
  createPostingLock,
  generateAccountingPeriods,
  getAccountingPeriodsReadiness,
  listAccountingPeriods,
  listFinancialYears,
  listPostingLocks,
  lockAccountingPeriod,
  removePostingLock,
  reopenAccountingPeriod,
  type AccountingPeriod,
  type AccountingPeriodReadiness,
  type AccountingPeriodStatus,
  type FinancialYear,
  type PostingLock,
} from "@/services/accounting";
import YearEndClosePanel from "./YearEndClosePanel";

const STATUS_LABEL: Record<AccountingPeriodStatus, string> = { OPEN: "Open", LOCKED: "Locked", CLOSED: "Closed" };
const MAPPING_AUDIT_HREF = "/admin/accounting/setup/mapping-audit";
const RECONCILIATION_RUNS_HREF = "/admin/reconciliation/runs";
const DOCUMENT_NUMBERING_HREF = ROUTES.admin.settingsBusinessSetupDocumentNumbering;
const FINANCE_ACCOUNTS_HREF = ROUTES.admin.settingsBusinessSetupFinanceAccounts;

function bridgeReviewHref(filters: { source_model?: string; status?: string; event_key?: string; accounting_period?: number | string }) {
  const params = new URLSearchParams();
  if (filters.source_model) params.set("source_model", filters.source_model);
  if (filters.status) params.set("status", filters.status);
  if (filters.event_key) params.set("event_key", filters.event_key);
  if (filters.accounting_period) params.set("accounting_period", String(filters.accounting_period));
  const query = params.toString();
  return query ? `${ROUTES.admin.accountingBridgeReconciliation}?${query}` : ROUTES.admin.accountingBridgeReconciliation;
}

function summaryCount(summary: AccountingBridgeReconciliationSummary | null, key: keyof AccountingBridgeReconciliationSummary, fallback = 0) {
  const value = summary?.[key];
  return typeof value === "number" ? value : fallback;
}

function statusForPeriod(period: AccountingPeriod): AccountingPeriodStatus {
  return period.status || (period.is_locked ? "LOCKED" : "OPEN");
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

function MetricCard({ label, value, detail, href, tone = "border-blue-200 bg-blue-50 text-blue-900" }: { label: string; value: number | string; detail?: string; href?: string; tone?: string }) {
  const body = (
    <div className={`rounded-2xl border p-4 shadow-sm ${tone}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {detail ? <div className="mt-1 text-xs opacity-80">{detail}</div> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function ReadinessPanel({ readiness }: { readiness: AccountingPeriodReadiness | null }) {
  const items = [
    { label: "Active financial year", ok: Boolean(readiness?.active_financial_year), detail: readiness?.active_financial_year?.code || "Not configured" },
    { label: "Current period", ok: Boolean(readiness?.current_period), detail: readiness?.current_period?.code || "No period covers today" },
    { label: "Posting lock", ok: !readiness?.posting_lock, detail: readiness?.posting_lock ? `Locked on ${readiness.posting_lock.lock_date}` : "No exact-date lock today" },
    { label: "Posting readiness", ok: Boolean(readiness?.is_ready), detail: readiness?.is_ready ? "Ready" : "Blocked" },
  ];
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Posting setup health</h2>
      <p className="mt-1 text-sm text-muted-foreground">Current financial-year, period, and exact-date lock posture. This panel is read-only.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${item.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
            <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{item.label}</div>
            <div className="mt-1 text-sm font-semibold">{item.detail}</div>
          </div>
        ))}
      </div>
      {readiness?.errors?.length ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{readiness.errors.join(" ")}</div> : null}
      {readiness?.warnings?.length ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{readiness.warnings.join(" ")}</div> : null}
    </section>
  );
}

function BridgeReadinessPanel({ summary }: { summary: AccountingBridgeReconciliationSummary | null }) {
  const metrics = [
    { label: "Ready unposted", value: summaryCount(summary, "ready_unposted_count"), href: bridgeReviewHref({ status: "READY_UNPOSTED" }), detail: "Concrete rows waiting for explicit posting." },
    { label: "Posted unverified", value: summaryCount(summary, "posted_unverified_count"), href: bridgeReviewHref({ status: "POSTED_UNVERIFIED" }), detail: "Journal exists; reconciliation still pending." },
    { label: "Blocked", value: summaryCount(summary, "blocked_count"), href: bridgeReviewHref({ status: "BLOCKED" }), detail: "Mapping, period, numbering, or approval blocker." },
    { label: "Mapping", value: summaryCount(summary, "blocked_by_mapping_count"), href: MAPPING_AUDIT_HREF, detail: "Posting profile or COA issue." },
    { label: "Finance account", value: summaryCount(summary, "blocked_by_finance_account_count"), href: FINANCE_ACCOUNTS_HREF, detail: "Collection account not ready." },
    { label: "Numbering", value: summaryCount(summary, "blocked_by_numbering_count"), href: DOCUMENT_NUMBERING_HREF, detail: "Journal numbering setup issue." },
    { label: "Exceptions", value: summaryCount(summary, "reconciliation_exception_count", summaryCount(summary, "exception_count")), href: RECONCILIATION_RUNS_HREF, detail: "Reconciliation errors requiring review." },
  ];
  const activeMetrics = metrics.filter((item) => item.value > 0);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Bridge close readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">Compact source-control view. Empty bridge sources are hidden so staff do not see fake work queues.</p>
        </div>
        <Link href={ROUTES.admin.accountingBridgeReconciliation} className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted">Open bridge cockpit</Link>
      </div>
      {activeMetrics.length === 0 ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          No current bridge candidates, blockers, posted-unverified rows, unsupported rows, or reconciliation exceptions are exposed by the backend payload.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {activeMetrics.map((item) => (
            <MetricCard key={item.label} label={item.label} value={item.value} detail={item.detail} href={item.href} tone={item.value ? "border-amber-200 bg-amber-50 text-amber-950" : undefined} />
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={bridgeReviewHref({ status: "READY_UNPOSTED" })} className="rounded-lg border px-3 py-2 font-semibold hover:bg-muted">Review unposted bridge items</Link>
        <Link href={MAPPING_AUDIT_HREF} className="rounded-lg border px-3 py-2 font-semibold hover:bg-muted">Open mapping audit</Link>
        <Link href={RECONCILIATION_RUNS_HREF} className="rounded-lg border px-3 py-2 font-semibold hover:bg-muted">Run reconciliation checks</Link>
      </div>
    </section>
  );
}

function PeriodsTable({ periods, busy, onChangeStatus }: { periods: AccountingPeriod[]; busy: string | null; onChangeStatus: (period: AccountingPeriod, status: AccountingPeriodStatus) => Promise<void> }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Accounting periods</h2>
          <p className="mt-1 text-sm text-muted-foreground">Period status is the primary posting control. Lock and close only after operational checks pass.</p>
        </div>
        <span className="text-sm font-semibold text-muted-foreground">{periods.length} period(s)</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {periods.map((period) => {
              const status = statusForPeriod(period);
              const isBusy = busy === `period-${period.id}`;
              return (
                <tr key={period.id}>
                  <td className="px-4 py-3 font-semibold">{period.code}</td>
                  <td className="px-4 py-3">{period.name || period.label}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(period.start_date)} – {fmtDate(period.end_date)}</td>
                  <td className="px-4 py-3"><span className="rounded-full border px-2.5 py-1 text-xs font-semibold">{STATUS_LABEL[status]}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {status !== "OPEN" ? <ConfirmActionButton label="Open" title={`Open ${period.code}?`} description="Opening restores posting into this accounting period. This is audited." disabled={isBusy} onConfirm={() => onChangeStatus(period, "OPEN")} variant="primary" /> : null}
                      {status !== "LOCKED" ? <ConfirmActionButton label="Lock" title={`Lock ${period.code}?`} description="Locking blocks further posting into this period until reopened." disabled={isBusy} onConfirm={() => onChangeStatus(period, "LOCKED")} variant="secondary" /> : null}
                      {status !== "CLOSED" ? <ConfirmActionButton label="Close" title={`Close ${period.code}?`} description="Close only after posting and reconciliation checks are complete." disabled={isBusy} onConfirm={() => onChangeStatus(period, "CLOSED")} variant="danger" /> : null}
                      <Link href={bridgeReviewHref({ accounting_period: period.id })} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted">View bridge items</Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AccountingPeriodsPage() {
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [locks, setLocks] = useState<PostingLock[]>([]);
  const [readiness, setReadiness] = useState<AccountingPeriodReadiness | null>(null);
  const [bridgeSummary, setBridgeSummary] = useState<AccountingBridgeReconciliationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fyForm, setFyForm] = useState({ code: "", name: "", start_date: "", end_date: "", notes: "" });
  const [lockForm, setLockForm] = useState({ lock_date: new Date().toISOString().slice(0, 10), reason: "" });

  const activeFinancialYear = useMemo(() => readiness?.active_financial_year || financialYears.find((year) => year.is_active) || null, [financialYears, readiness]);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true); else setRefreshing(true);
    try {
      const [fyPayload, periodPayload, lockPayload, readinessPayload, bridgePayload] = await Promise.all([
        listFinancialYears(),
        listAccountingPeriods(),
        listPostingLocks(),
        getAccountingPeriodsReadiness(),
        getAccountingBridgeReconciliation(),
      ]);
      setFinancialYears(fyPayload.results);
      setPeriods(periodPayload.results);
      setLocks(lockPayload.results);
      setReadiness(readinessPayload);
      setBridgeSummary(bridgePayload.summary);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load accounting period controls."));
      if (mode === "initial") {
        setFinancialYears([]);
        setPeriods([]);
        setLocks([]);
        setReadiness(null);
        setBridgeSummary(null);
      }
    } finally {
      if (mode === "initial") setLoading(false); else setRefreshing(false);
    }
  }

  useEffect(() => { void loadPage("initial"); }, []);

  async function handleCreateFinancialYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createFinancialYear(fyForm);
      setNotice("Financial year created.");
      setFyForm({ code: "", name: "", start_date: "", end_date: "", notes: "" });
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to create financial year."));
    }
  }

  async function handleCreateLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createPostingLock(lockForm);
      setNotice("Posting lock created.");
      setLockForm((current) => ({ ...current, reason: "" }));
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to create posting lock."));
    }
  }

  async function handleGenerateCurrentPeriod() {
    setActionBusy("period");
    try {
      const result = await generateCurrentAccountingPeriod();
      setNotice(result.detail || "Current accounting period generated or confirmed.");
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to generate current accounting period."));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleSeedMappings() {
    setActionBusy("seed");
    try {
      const result = await seedSupportedAccountingMappings();
      setNotice(`Supported mappings seeded. Journals created: ${result.journal_entries_created}; numbering profiles created: ${result.document_sequences_allocated}.`);
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to seed supported mappings."));
    } finally {
      setActionBusy(null);
    }
  }

  async function changePeriodStatus(period: AccountingPeriod, status: AccountingPeriodStatus) {
    setActionBusy(`period-${period.id}`);
    try {
      const reason = `${STATUS_LABEL[status]} from admin accounting period cockpit.`;
      if (status === "OPEN") await reopenAccountingPeriod(period.id, reason);
      else if (status === "LOCKED") await lockAccountingPeriod(period.id, reason);
      else await closeAccountingPeriod(period.id, reason);
      setNotice(`Period ${period.code} moved to ${STATUS_LABEL[status]}.`);
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, `Failed to ${STATUS_LABEL[status].toLowerCase()} ${period.code}.`));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleGeneratePeriods(year: FinancialYear) {
    setActionBusy(`fy-${year.id}`);
    try {
      const result = await generateAccountingPeriods(year.id);
      setNotice(`Generated ${result.created_count} period(s) for ${year.code}.`);
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, `Failed to generate periods for ${year.code}.`));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleActivateYear(year: FinancialYear) {
    setActionBusy(`fy-${year.id}`);
    try {
      await activateFinancialYear(year.id);
      setNotice(`${year.code} activated.`);
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, `Failed to activate ${year.code}.`));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleRemoveLock(lock: PostingLock) {
    setActionBusy(`lock-${lock.id}`);
    try {
      await removePostingLock(lock.id);
      setNotice(`Posting lock ${lock.lock_date} removed.`);
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to remove posting lock."));
    } finally {
      setActionBusy(null);
    }
  }

  if (loading) return <main className="p-6"><div className="rounded-2xl border p-6 text-sm text-muted-foreground">Loading accounting periods…</div></main>;

  const openPeriodCount = periods.filter((period) => statusForPeriod(period) === "OPEN").length;
  const lockedPeriodCount = periods.filter((period) => statusForPeriod(period) === "LOCKED").length;
  const closedPeriodCount = periods.filter((period) => statusForPeriod(period) === "CLOSED").length;

  return (
    <main className="space-y-6 p-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Admin · Accounting · Periods</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Accounting Period Cockpit</h1>
            <p className="mt-2 max-w-4xl text-sm text-muted-foreground">Control the active financial year, monthly accounting periods, exact-date posting locks, and controlled year-end close. Bridge readiness is compact and shows only real source rows or blockers.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={refreshing} onClick={() => loadPage("refresh")} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">{refreshing ? "Refreshing…" : "Refresh"}</button>
            <button type="button" disabled={actionBusy === "period"} onClick={handleGenerateCurrentPeriod} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">Generate current period</button>
            <button type="button" disabled={actionBusy === "seed"} onClick={handleSeedMappings} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Seed supported mappings</button>
          </div>
        </div>
        {notice ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div> : null}
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Financial years" value={financialYears.length} />
        <MetricCard label="Periods" value={periods.length} />
        <MetricCard label="Open" value={openPeriodCount} tone="border-amber-200 bg-amber-50 text-amber-950" />
        <MetricCard label="Locked" value={lockedPeriodCount} />
        <MetricCard label="Closed" value={closedPeriodCount} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
        <MetricCard label="Posting locks" value={locks.length} />
      </section>

      <ReadinessPanel readiness={readiness} />
      <BridgeReadinessPanel summary={bridgeSummary} />
      <YearEndClosePanel financialYears={financialYears} activeFinancialYear={activeFinancialYear} onChanged={() => loadPage("refresh")} />
      <PeriodsTable periods={periods} busy={actionBusy} onChangeStatus={changePeriodStatus} />

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Create Financial Year</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create the FY first, activate it, then generate monthly periods.</p>
          <form onSubmit={handleCreateFinancialYear} className="mt-4 grid gap-3 md:grid-cols-2">
            <input value={fyForm.code} onChange={(event) => setFyForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="rounded-lg border bg-background px-3 py-2 text-sm" required />
            <input value={fyForm.name} onChange={(event) => setFyForm((current) => ({ ...current, name: event.target.value }))} placeholder="Name" className="rounded-lg border bg-background px-3 py-2 text-sm" required />
            <input type="date" value={fyForm.start_date} onChange={(event) => setFyForm((current) => ({ ...current, start_date: event.target.value }))} className="rounded-lg border bg-background px-3 py-2 text-sm" required />
            <input type="date" value={fyForm.end_date} onChange={(event) => setFyForm((current) => ({ ...current, end_date: event.target.value }))} className="rounded-lg border bg-background px-3 py-2 text-sm" required />
            <input value={fyForm.notes} onChange={(event) => setFyForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" className="rounded-lg border bg-background px-3 py-2 text-sm md:col-span-2" />
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Create FY</button>
          </form>
          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-border">
                {financialYears.map((year) => (
                  <tr key={year.id}>
                    <td className="px-4 py-3"><div className="font-semibold">{year.code}</div><div className="text-xs text-muted-foreground">{year.name}</div></td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(year.start_date)} – {fmtDate(year.end_date)}</td>
                    <td className="px-4 py-3">{year.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-2"><button type="button" disabled={actionBusy === `fy-${year.id}`} onClick={() => handleGeneratePeriods(year)} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">Generate periods</button>{!year.is_active ? <button type="button" disabled={actionBusy === `fy-${year.id}`} onClick={() => handleActivateYear(year)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Activate</button> : null}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Posting locks</h2>
          <p className="mt-1 text-sm text-muted-foreground">Exact-date locks are additional controls. Period status remains the primary posting control.</p>
          <form onSubmit={handleCreateLock} className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
            <input type="date" value={lockForm.lock_date} onChange={(event) => setLockForm((current) => ({ ...current, lock_date: event.target.value }))} className="rounded-lg border bg-background px-3 py-2 text-sm" required />
            <input value={lockForm.reason} onChange={(event) => setLockForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Why this date is locked" className="rounded-lg border bg-background px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Create lock</button>
          </form>
          <div className="mt-5 space-y-2">
            {locks.length === 0 ? <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No posting locks. Use locks only when an exact date must be blocked independently of the period status.</div> : locks.map((lock) => (
              <div key={lock.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                <div><div className="font-semibold">{fmtDate(lock.lock_date)}</div><div className="text-xs text-muted-foreground">{lock.reason || "No reason supplied"}</div></div>
                <ConfirmActionButton label="Remove" title={`Remove posting lock ${lock.lock_date}?`} description="Removing this exact-date lock restores posting if the accounting period also permits posting." disabled={actionBusy === `lock-${lock.id}`} onConfirm={() => handleRemoveLock(lock)} variant="danger" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
