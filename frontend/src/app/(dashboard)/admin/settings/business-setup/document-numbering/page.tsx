"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { invalidateAfterDocumentNumberingMutation } from "@/lib/operational-query-invalidation";
import { ROUTES } from "@/lib/routes";
import {
  activateFinancialYear,
  createFinancialYear,
  generateAccountingPeriods,
  listAccountingPeriods,
  listFinancialYears,
  type AccountingPeriod,
  type AccountingPeriodStatus,
  type FinancialYear,
} from "@/services/accounting";
import { generateCurrentAccountingPeriod } from "@/services/accounting-period-actions";
import { seedSupportedAccountingMappings } from "@/services/accounting-mapping-remediation";
import {
  getDocumentNumberingState,
  getServerDate,
  updateDocumentNumbering,
  type DocumentNumberingSequence,
  type DocumentNumberingState,
} from "@/services/business-setup";

// ─── INDIAN FY HELPERS ────────────────────────────────────────────────────────
// Indian FY: 1 April (startYear) → 31 March (startYear + 1)

type IndianFY = {
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  startYear: number;
  endYear: number;
  shortLabel: string;
};

function calcIndianFY(fromDate = new Date()): IndianFY {
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  const short = `${startYear}-${String(endYear).slice(-2)}`;
  return { code: `FY${short}`, name: `Financial Year ${short}`, startDate: `${startYear}-04-01`, endDate: `${endYear}-03-31`, startYear, endYear, shortLabel: short };
}

function calcNextIndianFY(current: IndianFY): IndianFY {
  return calcIndianFY(new Date(`${current.endYear}-04-02`));
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)); }
  catch { return iso; }
}

function toErr(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong.";
}

const PERIOD_STATUS_LABEL: Record<AccountingPeriodStatus, string> = { OPEN: "Open", LOCKED: "Locked", CLOSED: "Closed" };

function periodStatus(p: AccountingPeriod): AccountingPeriodStatus {
  return p.status || (p.is_locked ? "LOCKED" : "OPEN");
}

// ─── FINANCIAL YEAR TAB ───────────────────────────────────────────────────────

function FinancialYearTab() {
  // serverDate is set once from the backend — protects against wrong browser clocks.
  const [serverDate, setServerDate] = useState<Date | null>(null);
  const [serverDateError, setServerDateError] = useState(false);

  const todayFY = useMemo(() => calcIndianFY(serverDate ?? new Date()), [serverDate]);
  const nextFY = useMemo(() => calcNextIndianFY(todayFY), [todayFY]);

  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const [fyRes, pRes] = await Promise.all([listFinancialYears(), listAccountingPeriods()]);
      setFinancialYears(fyRes.results);
      setPeriods(pRes.results);
      setError(null);
    } catch (e) { setError(toErr(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    void load();
    // Fetch server date to verify the Indian FY, ignoring browser clock.
    getServerDate()
      .then((r) => setServerDate(new Date(r.server_date + "T00:00:00")))
      .catch(() => setServerDateError(true));
  }, []);

  const activeFY = useMemo(() => financialYears.find((y) => y.is_active) ?? null, [financialYears]);
  const activePeriods = useMemo(
    () => periods.filter((p) => activeFY && (p.financial_year === activeFY.id || p.financial_year_code === activeFY.code)),
    [periods, activeFY],
  );

  // Sets up the CURRENT financial year: create + activate + generate 12 months.
  async function autoSetupCurrentFY(fy: IndianFY) {
    setBusy(`setup-${fy.code}`);
    setError(null);
    setNotice(null);
    try {
      let fyRecord: FinancialYear | undefined = financialYears.find((y) => y.code === fy.code);
      if (!fyRecord) {
        fyRecord = await createFinancialYear({ code: fy.code, name: fy.name, start_date: fy.startDate, end_date: fy.endDate, notes: "Auto-created from Indian FY setup." });
      }
      if (fyRecord?.id) {
        if (!fyRecord.is_active) await activateFinancialYear(fyRecord.id);
        await generateAccountingPeriods(fyRecord.id);
      }
      await generateCurrentAccountingPeriod();
      await load();
      setNotice(`${fy.name} is now active with 12 monthly periods ready.`);
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(null); }
  }

  // Prepares NEXT financial year: create + generate periods only — does NOT activate.
  async function prepareNextFY(fy: IndianFY) {
    setBusy(`setup-${fy.code}`);
    setError(null);
    setNotice(null);
    try {
      let fyRecord: FinancialYear | undefined = financialYears.find((y) => y.code === fy.code);
      if (!fyRecord) {
        fyRecord = await createFinancialYear({ code: fy.code, name: fy.name, start_date: fy.startDate, end_date: fy.endDate, notes: "Prepared in advance. Will be activated when the new financial year begins." });
      }
      if (fyRecord?.id) {
        await generateAccountingPeriods(fyRecord.id);
      }
      await load();
      setNotice(`${fy.name} is created with 12 monthly periods. It is NOT yet active — your current year stays active until you are ready to switch.`);
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(null); }
  }

  async function activateOnly(fy: FinancialYear) {
    const status = classifyFY(fy);

    // Future year: hard block — cannot activate before 1 April of that year.
    if (status === "future") {
      const days = daysUntilStart(fy);
      setError(
        `Cannot activate ${fy.code} yet. The Indian Financial Year ${fy.code} begins on 1 April ${fy.start_date.slice(0, 4)} — that is ${days} day${days === 1 ? "" : "s"} from today. Activate it on or after 1 April ${fy.start_date.slice(0, 4)}.`
      );
      return;
    }

    // Past year: warn before reactivating a closed year.
    if (status === "past") {
      const confirmed = window.confirm(
        `Warning: ${fy.code} is a past financial year that ended on ${fmtDate(fy.end_date)}.\n\nReactivating a past year means all new entries will post to a closed period. This is normally incorrect.\n\nOnly proceed if you have a specific accounting reason (e.g. late audit correction). Continue?`
      );
      if (!confirmed) return;
    }

    setBusy(`activate-${fy.id}`);
    setError(null);
    try {
      await activateFinancialYear(fy.id);
      await load();
      setNotice(`${fy.code} is now the active financial year.`);
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(null); }
  }

  async function generatePeriodsFor(fy: FinancialYear) {
    setBusy(`gen-${fy.id}`);
    setError(null);
    try {
      const result = await generateAccountingPeriods(fy.id);
      await load();
      setNotice(`Created ${result.created_count} period(s) for ${fy.code}.`);
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(null); }
  }

  const todayFYExists = financialYears.some((y) => y.code === todayFY.code);
  const nextFYExists = financialYears.some((y) => y.code === nextFY.code);
  const todayFYActive = activeFY?.code === todayFY.code;

  /**
   * Classify a stored FY against the verified server date using string comparison
   * to avoid JavaScript timezone ambiguity around midnight.
   * Indian FY always has start_date = YYYY-04-01 and end_date = YYYY-03-31.
   * "current"  → start_date ≤ today ≤ end_date
   * "past"     → end_date < today  (FY has fully closed)
   * "future"   → start_date > today (FY has not yet begun)
   */
  function classifyFY(fy: FinancialYear): "current" | "past" | "future" {
    // ISO date string comparison is safe: "2027-04-01" > "2026-07-16" works lexicographically.
    const today = (serverDate ?? new Date()).toISOString().slice(0, 10);
    const start = (fy.start_date ?? "").slice(0, 10);
    const end = (fy.end_date ?? "").slice(0, 10);
    if (today < start) return "future";
    if (today > end) return "past";
    return "current";
  }

  /** Days from today until a future FY's start date (1 April of that year). */
  function daysUntilStart(fy: FinancialYear): number {
    const today = serverDate ?? new Date();
    const start = new Date(fy.start_date + "T00:00:00");
    return Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * True when the server date has crossed into a new Indian FY (on/after 1 April)
   * but the system is still running on the old active year.
   * Example: today = 3 April 2027, active = FY2026-27, current should be FY2027-28.
   */
  const newFYStartedButNotActivated =
    serverDate !== null && !todayFYActive && activeFY !== null;

  if (loading) return <div className="py-6 text-sm text-muted-foreground">Loading financial years…</div>;

  return (
    <div className="space-y-6">
      {/* ── New FY started but old year still active ───────────────────────── */}
      {newFYStartedButNotActivated && (
        <div className="rounded-xl border-2 border-orange-400 bg-orange-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-orange-800">
                🗓 New Indian Financial Year has started — action needed
              </p>
              <p className="mt-1 text-sm text-orange-700">
                <strong>{todayFY.name}</strong> began on <strong>1 April {todayFY.startYear}</strong>.
                Your system is still running on <strong>{activeFY.code}</strong> (ended {fmtDate(activeFY.end_date)}).
                Switch to the new year so invoices, payments and ledger entries post to the correct period.
              </p>
            </div>
            <button
              type="button"
              disabled={busy === `setup-${todayFY.code}`}
              onClick={() => void autoSetupCurrentFY(todayFY)}
              className="shrink-0 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-orange-700 disabled:opacity-50"
            >
              {busy === `setup-${todayFY.code}` ? "Switching…" : `Switch to ${todayFY.shortLabel} now`}
            </button>
          </div>
        </div>
      )}
      {/* What is an Indian FY */}
      <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info className="mt-0.5 size-4 shrink-0 text-sky-600" />
        <div className="flex-1">
          <strong>Indian financial year = 1 April → 31 March.</strong>{" "}
          Each year starts on 1 April and ends on 31 March the following year. Example: FY 2026-27 runs 1 Apr 2026 – 31 Mar 2027.
          <div className="mt-1.5 flex items-center gap-2">
            {serverDate ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="size-3" /> Server date confirmed: {fmtDate(serverDate.toISOString().slice(0, 10))}
              </span>
            ) : serverDateError ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                <AlertCircle className="size-3" /> Could not verify server date — using your device clock
              </span>
            ) : (
              <span className="text-xs text-sky-600">Checking server date…</span>
            )}
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}
      {notice ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />{notice}
        </div>
      ) : null}

      {/* Current FY auto-setup card */}
      <div className="rounded-xl border-2 border-primary/30 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">You are currently in</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{todayFY.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{fmtDate(todayFY.startDate)} → {fmtDate(todayFY.endDate)}</p>
            {todayFYExists && todayFYActive ? (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="size-3.5" /> Active and ready
              </span>
            ) : (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                <AlertCircle className="size-3.5" /> {todayFYExists ? "Created but not active" : "Not set up yet"}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={busy === `setup-${todayFY.code}`}
            onClick={() => void autoSetupCurrentFY(todayFY)}
            className="rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background shadow hover:bg-foreground/90 disabled:opacity-50"
          >
            {busy === `setup-${todayFY.code}` ? "Setting up…" : todayFYActive ? "Re-generate periods" : `Set up ${todayFY.shortLabel} automatically`}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          One click: creates the financial year, marks it active, and generates all 12 monthly periods. Nothing else needed.
        </p>
      </div>

      {/* Next FY prep — creates + generates periods but does NOT activate */}
      <div className="rounded-xl border border-border bg-muted/30 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Prepare next year — {nextFY.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(nextFY.startDate)} → {fmtDate(nextFY.endDate)}</p>
            <p className="mt-1 text-xs text-amber-700 font-medium">Creates the year and 12 months in advance. Will NOT activate — your current year stays active.</p>
          </div>
          <button
            type="button"
            disabled={busy === `setup-${nextFY.code}`}
            onClick={() => void prepareNextFY(nextFY)}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            {busy === `setup-${nextFY.code}` ? "Preparing…" : nextFYExists ? "Re-generate periods" : `Prepare ${nextFY.shortLabel}`}
          </button>
        </div>
      </div>

      {/* All FY table */}
      {financialYears.length > 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">All financial years</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Year</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {financialYears.map((fy) => (
                  <tr key={fy.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{fy.code}</div>
                      <div className="text-xs text-muted-foreground">{fy.name}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(fy.start_date)} → {fmtDate(fy.end_date)}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        if (fy.is_active) return (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            <CheckCircle2 className="size-3" /> Active
                          </span>
                        );
                        const cls = classifyFY(fy);
                        if (cls === "future") return (
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                            <Info className="size-3" /> Future — starts 1 Apr {fy.start_date.slice(0, 4)}
                          </span>
                        );
                        if (cls === "past") return (
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                            <AlertCircle className="size-3" /> Closed — ended {fmtDate(fy.end_date)}
                          </span>
                        );
                        return (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                            Current year — not active
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={!!busy} onClick={() => void generatePeriodsFor(fy)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                          {busy === `gen-${fy.id}` ? "Generating…" : "Generate monthly periods"}
                        </button>
                        {!fy.is_active && (() => {
                          const cls = classifyFY(fy);
                          if (cls === "future") {
                            const days = daysUntilStart(fy);
                            return (
                              <span
                                className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 cursor-not-allowed"
                                title={`Activating a future year is blocked. ${fy.code} starts on 1 April ${fy.start_date.slice(0, 4)} (${days} day${days === 1 ? "" : "s"} away).`}
                              >
                                <Info className="size-3" /> Cannot activate yet ({days}d away)
                              </span>
                            );
                          }
                          if (cls === "past") return (
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => void activateOnly(fy)}
                              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                              {busy === `activate-${fy.id}` ? "Activating…" : "Reactivate past year"}
                            </button>
                          );
                          // current but inactive
                          return (
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => void activateOnly(fy)}
                              className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:bg-foreground/90 disabled:opacity-50"
                            >
                              {busy === `activate-${fy.id}` ? "Activating…" : "Make active"}
                            </button>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-10 text-center text-sm text-muted-foreground">
          No financial years yet. Click <strong>Set up automatically</strong> above to get started.
        </div>
      )}

      {/* Monthly periods for active FY */}
      {activeFY && activePeriods.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <div className="text-sm font-semibold text-foreground">Monthly periods — {activeFY.code}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              These 12 periods track when transactions are recorded. To open, lock, or close periods go to the{" "}
              <a href={ROUTES.admin.accountingPeriods} className="font-medium underline">Accounting Period Cockpit</a>.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activePeriods.map((p) => {
                  const st = periodStatus(p);
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-semibold text-foreground">{p.code}</td>
                      <td className="px-4 py-3 text-foreground">{p.name || p.label}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          st === "OPEN" ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : st === "LOCKED" ? "border-amber-300 bg-amber-50 text-amber-800"
                          : "border-border bg-muted text-muted-foreground"
                        }`}>{PERIOD_STATUS_LABEL[st]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {activeFY && activePeriods.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No monthly periods found for {activeFY.code}. Click <strong>Generate monthly periods</strong> in the table above.
        </div>
      )}
    </div>
  );
}

// ─── DOCUMENT NUMBERING TAB ───────────────────────────────────────────────────

function toDocErr(e: unknown): string {
  return e instanceof Error ? e.message : "Failed to load document numbering setup.";
}

type DraftState = Record<string, { prefix: string; pattern: string; suffix: string; reset_policy: string; next_number: string; padding: string }>;
const emptyDraft = { prefix: "", pattern: "{PREFIX}-{number}", suffix: "", reset_policy: "YEARLY", next_number: "1", padding: "5" };
const SUMMARY_ORDER = ["CONTRACT", "RECEIPT", "TAX_INVOICE", "DIRECT_SALE", "RENT_INVOICE", "LEASE_INVOICE", "DEPOSIT_RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE", "JOURNAL_ENTRY", "SETTLEMENT", "PAYOUT"];

function docStatusLabel(status: string): string {
  if (status === "ready") return "Ready";
  if (status === "duplicate_risk") return "Duplicate risk";
  if (status === "blocked") return "Blocked";
  return "Needs setup";
}

function docStatusClass(status: string): string {
  if (status === "ready") return "bg-emerald-500/10 text-emerald-700 border-emerald-200";
  if (status === "duplicate_risk" || status === "blocked") return "bg-rose-500/10 text-rose-700 border-rose-200";
  return "bg-amber-500/10 text-amber-700 border-amber-200";
}

function workflowLabel(sequence: DocumentNumberingSequence): string {
  const group = (sequence.workflow_group || "").replace(/_/g, " ");
  return group ? group.replace(/\b\w/g, (char) => char.toUpperCase()) : "General";
}

function nextPreview(pattern: string, prefix: string, suffix: string, fy: string, doc: string, nextNumber: string, padding: string): string {
  const safeNumber = Math.max(1, Number(nextNumber || "1"));
  const safePadding = Math.min(12, Math.max(1, Number(padding || "5")));
  const cleanPrefix = (prefix || "").trim().toUpperCase();
  if (!cleanPrefix || Number.isNaN(safeNumber) || Number.isNaN(safePadding)) return "Invalid draft";
  const legacyFy = (fy || "").replace(/^FY/i, "");
  const yyyy = legacyFy.slice(0, 4);
  const yy = yyyy.slice(-2);
  const number = String(safeNumber).padStart(safePadding, "0");
  return (pattern || "{PREFIX}-{number}")
    .replaceAll("{PREFIX}", cleanPrefix)
    .replaceAll("{FY}", legacyFy)
    .replaceAll("{YYYY}", yyyy)
    .replaceAll("{YY}", yy)
    .replaceAll("{DOC}", doc || cleanPrefix)
    .replace(/\{number(?::\d{1,2})?\}/gi, number)
    .concat(suffix || "")
    .toUpperCase();
}

function DocumentNumberingTab() {
  const queryClient = useQueryClient();
  const [data, setData] = useState<DocumentNumberingState | null>(null);
  const [drafts, setDrafts] = useState<DraftState>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  async function load() {
    try {
      const response = await getDocumentNumberingState();
      setData(response);
      setDrafts(
        response.sequences.reduce<DraftState>((acc, sequence) => {
          acc[sequence.key] = {
            prefix: sequence.prefix || sequence.default_prefix || "",
            pattern: sequence.pattern || sequence.default_pattern || "{PREFIX}-{number}",
            suffix: sequence.suffix || "",
            reset_policy: sequence.reset_policy || "YEARLY",
            next_number: String(sequence.next_number || sequence.min_safe_next_number || 1),
            padding: String(sequence.padding || sequence.default_padding || 5),
          };
          return acc;
        }, {}),
      );
      setError(null);
    } catch (loadError) {
      setError(toDocErr(loadError));
    }
  }

  useEffect(() => { void load(); }, []);

  const rows = useMemo(() => data?.sequences || [], [data]);
  const summaryRows = useMemo(() => {
    const rank = (sequence: DocumentNumberingSequence) => {
      const key = `${sequence.key} ${sequence.document_type} ${sequence.name}`.toUpperCase();
      const index = SUMMARY_ORDER.findIndex((item) => key.includes(item));
      return index === -1 ? SUMMARY_ORDER.length : index;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [rows]);
  const summary = data?.summary || {};
  const missingRows = rows.filter((row) => !row.configured);
  const blockingRows = rows.filter((row) => row.status === "blocked" || row.status === "duplicate_risk");

  async function save(sequence: DocumentNumberingSequence) {
    const draft = drafts[sequence.key];
    if (!draft) return;
    try {
      setSavingKey(sequence.key);
      setError(null);
      setNotice(null);
      const minSafeNext = sequence.min_safe_next_number || 1;
      const nextNumber = Number(draft.next_number || "0");
      const padding = Number(draft.padding || "0");
      if (!draft.prefix.trim()) { setError("Prefix cannot be empty."); return; }
      if (!Number.isFinite(padding) || padding < 1 || padding > 12) { setError("Padding must be between 1 and 12."); return; }
      if (!Number.isFinite(nextNumber) || nextNumber < minSafeNext) { setError(`Next number cannot be below the last issued safe value (${minSafeNext}).`); return; }
      const livePrefixChanged = sequence.configured && Number(sequence.issued_count || 0) > 0 && draft.prefix.trim().toUpperCase() !== (sequence.prefix || "").trim().toUpperCase();
      if (livePrefixChanged && !window.confirm("Changing numbering affects future documents only. Existing documents are never renumbered. Continue with this prefix change?")) return;
      const response = await updateDocumentNumbering({ key: sequence.key, prefix: draft.prefix, pattern: draft.pattern, suffix: draft.suffix, reset_policy: draft.reset_policy, next_number: nextNumber, padding });
      setData(response);
      setDrafts(response.sequences.reduce<DraftState>((acc, row) => {
        acc[row.key] = { prefix: row.prefix || row.default_prefix || "", pattern: row.pattern || row.default_pattern || "{PREFIX}-{number}", suffix: row.suffix || "", reset_policy: row.reset_policy || "YEARLY", next_number: String(row.next_number || row.min_safe_next_number || 1), padding: String(row.padding || row.default_padding || 5) };
        return acc;
      }, {}));
      setNotice(`${sequence.name} numbering updated. Existing issued documents were not changed.`);
      await invalidateAfterDocumentNumberingMutation(queryClient);
    } catch (saveError) {
      setError(toDocErr(saveError));
    } finally {
      setSavingKey(null);
    }
  }

  async function seedMissingDefaults() {
    if (!missingRows.length) return;
    try {
      setSeeding(true); setError(null); setNotice(null);
      let latest: DocumentNumberingState | null = data;
      for (const sequence of missingRows) {
        latest = await updateDocumentNumbering({ key: sequence.key, prefix: sequence.default_prefix || sequence.prefix, pattern: sequence.default_pattern || sequence.pattern || "{PREFIX}-{number}", suffix: sequence.suffix || "", reset_policy: sequence.reset_policy || "YEARLY", next_number: Math.max(1, sequence.min_safe_next_number || 1), padding: sequence.default_padding || sequence.padding || 5 });
      }
      if (latest) {
        setData(latest);
        setDrafts(latest.sequences.reduce<DraftState>((acc, row) => {
          acc[row.key] = { prefix: row.prefix || row.default_prefix || "", pattern: row.pattern || row.default_pattern || "{PREFIX}-{number}", suffix: row.suffix || "", reset_policy: row.reset_policy || "YEARLY", next_number: String(row.next_number || row.min_safe_next_number || 1), padding: String(row.padding || row.default_padding || 5) };
          return acc;
        }, {}));
      }
      setNotice(`Seeded ${missingRows.length} missing numbering row(s) with safe defaults.`);
      await invalidateAfterDocumentNumberingMutation(queryClient);
    } catch (seedError) {
      setError(toDocErr(seedError));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Changing numbering affects future documents only. Existing documents are never renumbered.
      </section>

      {data?.setup_blockers?.length ? (
        <section className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
          <div className="font-semibold">Readiness blockers</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">{data.setup_blockers.map((item, index) => <li key={`setup-blocker-${index}`}>{item}</li>)}</ul>
        </section>
      ) : null}
      {notice ? <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</section> : null}
      {error ? <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</section> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void seedMissingDefaults()} disabled={seeding || missingRows.length === 0} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {seeding ? "Seeding..." : missingRows.length ? `Seed missing defaults (${missingRows.length})` : "Defaults configured"}
        </button>
      </div>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <div className="text-sm font-semibold text-foreground">Sequence summary</div>
          <p className="mt-1 text-sm text-muted-foreground">Preview the next future number and verify where each sequence is used before editing details below.</p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          {summaryRows.length === 0 ? <div className="text-sm text-muted-foreground">No numbering rows returned by the backend.</div> : null}
          {summaryRows.map((sequence) => (
            <article key={`summary-${sequence.key}`} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{sequence.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{workflowLabel(sequence)} · {sequence.document_type || sequence.key}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${docStatusClass(sequence.status)}`}>{docStatusLabel(sequence.status)}</span>
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div><span className="text-muted-foreground">Prefix</span><div className="font-semibold text-foreground">{sequence.prefix || "Missing"}</div></div>
                <div><span className="text-muted-foreground">Next preview</span><div className="font-semibold text-foreground">{sequence.preview_number || sequence.next_number_preview || "Not configured"}</div></div>
                <div><span className="text-muted-foreground">Last issued</span><div className="font-semibold text-foreground">{sequence.last_issued_number || "None"}</div></div>
                <div><span className="text-muted-foreground">Fiscal year mode</span><div className="font-semibold text-foreground">{sequence.reset_policy || "YEARLY"}</div></div>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Used for: {sequence.description || `${sequence.doc_kind || "document"} workflow in ${workflowLabel(sequence)}.`}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Financial year</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{data?.active_financial_year_code || data?.financial_year || "…"}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {data?.active_financial_year_date_range?.start_date && data?.active_financial_year_date_range?.end_date
              ? `${data.active_financial_year_date_range.start_date} to ${data.active_financial_year_date_range.end_date}`
              : "No active FY configured"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Ready</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{Number(summary.ready_count || 0)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Needs setup</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{Number(summary.needs_setup_count || missingRows.length)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Blocked</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{Number(summary.blocked_count || blockingRows.length)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Current period</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{data?.current_period?.status || "…"}</div>
          <div className="mt-1 text-xs text-muted-foreground">{data?.current_period?.name || "No period for today"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Issued docs</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{Number(summary.issued_document_count || 0)}</div>
        </div>
      </section>

      {data?.operator_rules?.length ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-semibold text-foreground">Operator rules</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {data.operator_rules.map((rule, index) => (
              <div key={`operator-rule-${index}`} className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">{rule}</div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <div className="text-sm font-semibold text-foreground">Numbering register</div>
          <p className="mt-1 text-sm text-muted-foreground">Required rows affect go-live. Future rent/lease rows may be prepared now without enabling collection execution.</p>
        </div>
        <div className="divide-y divide-border">
          {rows.length === 0 ? <div className="px-5 py-8 text-sm text-muted-foreground">No numbering rows returned by the backend.</div> : null}
          {rows.map((sequence) => {
            const draft = drafts[sequence.key];
            const minSafeNext = sequence.min_safe_next_number || 1;
            const draftNext = Number(draft?.next_number || "0");
            const draftPadding = Number(draft?.padding || "0");
            const draftInvalid = !draft || !draft.prefix.trim() || draftNext < minSafeNext || draftPadding < 1 || draftPadding > 12;
            return (
              <div key={sequence.key} className="space-y-4 px-5 py-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground">{sequence.name}</h2>
                      <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold uppercase text-muted-foreground">{workflowLabel(sequence)}</span>
                      {sequence.required_for_go_live === false
                        ? <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-blue-800">Future / optional</span>
                        : <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-amber-800">Required</span>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{sequence.series_code} · {sequence.document_type || sequence.key} · {sequence.active_financial_year_code || sequence.financial_year} · {sequence.doc_kind || "document"}</div>
                    {sequence.description ? <p className="mt-2 text-sm text-muted-foreground">{sequence.description}</p> : null}
                  </div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${docStatusClass(sequence.status)}`}>{docStatusLabel(sequence.status)}</span>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs uppercase text-muted-foreground">Last issued</div><div className="mt-1 text-sm font-semibold text-foreground">{sequence.last_issued_number || "—"}</div></div>
                  <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs uppercase text-muted-foreground">Issued count</div><div className="mt-1 text-sm font-semibold text-foreground">{Number(sequence.issued_count || 0)}</div></div>
                  <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs uppercase text-muted-foreground">Min safe next</div><div className="mt-1 text-sm font-semibold text-foreground">{minSafeNext}</div></div>
                  <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs uppercase text-muted-foreground">Duplicate issues</div><div className="mt-1 text-sm font-semibold text-foreground">{Number(sequence.duplicate_count || 0)}</div></div>
                </div>

                {[...(sequence.blockers || []), ...(sequence.warnings || [])].length ? (
                  <div className="grid gap-2">
                    {(sequence.blockers || []).map((item, index) => <div key={`${sequence.key}-blocker-${index}`} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{item}</div>)}
                    {(sequence.warnings || []).map((item, index) => <div key={`${sequence.key}-warning-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{item}</div>)}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-6">
                  <label className="text-xs text-muted-foreground md:col-span-2">
                    Prefix
                    <input value={draft?.prefix || ""} onChange={(event) => setDrafts((prev) => ({ ...prev, [sequence.key]: { ...(prev[sequence.key] || emptyDraft), prefix: event.target.value.toUpperCase() } }))} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
                    {sequence.can_edit_prefix === false ? <span className="mt-1 block text-[11px] text-amber-700">Existing documents use this series. Change prefix only when intentionally starting a new future series.</span> : null}
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Next number
                    <input type="number" min={minSafeNext} value={draft?.next_number || ""} onChange={(event) => setDrafts((prev) => ({ ...prev, [sequence.key]: { ...(prev[sequence.key] || emptyDraft), next_number: event.target.value } }))} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
                    <span className="mt-1 block text-[11px] text-muted-foreground">Must be ≥ {minSafeNext}</span>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Padding
                    <input type="number" min={1} max={12} value={draft?.padding || ""} onChange={(event) => setDrafts((prev) => ({ ...prev, [sequence.key]: { ...(prev[sequence.key] || emptyDraft), padding: event.target.value } }))} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
                  </label>
                  <div className="text-xs text-muted-foreground">
                    Current preview
                    <div className="mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">{sequence.preview_number || sequence.next_number_preview || "Not configured"}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Draft preview
                    <div className={`mt-1 rounded-lg border px-3 py-2 text-sm ${draftInvalid ? "border-rose-200 bg-rose-50 text-rose-800" : "border-border bg-muted text-foreground"}`}>
                      {draft ? nextPreview(draft.pattern, draft.prefix, draft.suffix, sequence.active_financial_year_code || sequence.financial_year, sequence.document_type || sequence.key, draft.next_number, draft.padding) : "—"}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-6">
                  <label className="text-xs text-muted-foreground md:col-span-3">
                    Pattern
                    <input value={draft?.pattern || ""} onChange={(event) => setDrafts((prev) => ({ ...prev, [sequence.key]: { ...(prev[sequence.key] || emptyDraft), pattern: event.target.value } }))} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
                    <span className="mt-1 block text-[11px] text-muted-foreground">Tokens: {"{FY}"}, {"{YYYY}"}, {"{YY}"}, {"{DOC}"}, {"{number}"}</span>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Suffix
                    <input value={draft?.suffix || ""} onChange={(event) => setDrafts((prev) => ({ ...prev, [sequence.key]: { ...(prev[sequence.key] || emptyDraft), suffix: event.target.value.toUpperCase() } }))} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
                  </label>
                  <label className="text-xs text-muted-foreground md:col-span-2">
                    Reset policy
                    <select value={draft?.reset_policy || "YEARLY"} onChange={(event) => setDrafts((prev) => ({ ...prev, [sequence.key]: { ...(prev[sequence.key] || emptyDraft), reset_policy: event.target.value } }))} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground">
                      <option value="YEARLY">Yearly</option>
                      <option value="MONTHLY">Monthly</option>
                      <option value="NEVER">Never</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  {sequence.can_seed_default ? (
                    <button type="button" onClick={() => setDrafts((prev) => ({ ...prev, [sequence.key]: { prefix: sequence.default_prefix || sequence.prefix, pattern: sequence.default_pattern || sequence.pattern || "{PREFIX}-{number}", suffix: sequence.suffix || "", reset_policy: sequence.reset_policy || "YEARLY", next_number: String(sequence.min_safe_next_number || 1), padding: String(sequence.default_padding || 5) } }))} className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent">
                      Fill default
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void save(sequence)} disabled={savingKey === sequence.key || draftInvalid} className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
                    {savingKey === sequence.key ? "Saving..." : sequence.configured ? "Save future numbering" : "Create numbering row"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "fy", label: "Financial Year & Periods" },
  { id: "numbering", label: "Document Numbering" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function BusinessSetupDocumentNumberingPage() {
  const [tab, setTab] = useState<TabId>("fy");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounting & Numbering Setup"
        description="Set up your Indian financial year (1 Apr – 31 Mar) and document numbering in one place."
        actions={null}
      />
      <BusinessSetupLinks />

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "fy" ? <FinancialYearTab /> : <DocumentNumberingTab />}
    </div>
  );
}
