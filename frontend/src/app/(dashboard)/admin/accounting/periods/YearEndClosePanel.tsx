"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { accountingErrorMessage, accountingFieldClassName } from "@/components/accounting/shared";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import type { FinancialYear } from "@/services/accounting";
import { getYearEndReadiness, runYearEndClose, type YearEndIssue, type YearEndReadiness } from "@/services/year-end-close";

const MAPPING_AUDIT_HREF = "/admin/accounting/setup/mapping-audit";
const DOCUMENT_NUMBERING_HREF = ROUTES.admin.settingsBusinessSetupDocumentNumbering;
const RECONCILIATION_RUNS_HREF = "/admin/reconciliation/runs";
const FINANCE_ACCOUNTS_HREF = ROUTES.admin.accountingFinanceAccounts;
const CLOSE_BLOCKED_MESSAGE = "Cannot close because open periods, unposted bridge items, or unresolved accounting blockers remain.";

type Props = {
  financialYears: FinancialYear[];
  activeFinancialYear: FinancialYear | null;
  onChanged: () => Promise<void> | void;
};

type MetricTone = "neutral" | "good" | "warning" | "danger";

function toneClass(tone: MetricTone) {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-900";
  return "border-border bg-background text-foreground";
}

function metric(label: string, value: number | string, detail?: string, tone: MetricTone = "neutral") {
  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${toneClass(tone)}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs opacity-80">{detail}</p> : null}
    </div>
  );
}

function actionHrefForIssue(item: YearEndIssue): string {
  if (item.action_href) return item.action_href;
  const code = (item.code || "").toUpperCase();
  if (code.includes("OPEN_PERIOD") || code.includes("PERIOD")) return ROUTES.admin.accountingPeriods;
  if (code.includes("UNPOSTED")) return `${ROUTES.admin.accountingBridgeReconciliation}?status=READY_UNPOSTED`;
  if (code.includes("MAPPING") || code.includes("BLOCKED_BRIDGE")) return MAPPING_AUDIT_HREF;
  if (code.includes("NUMBERING")) return DOCUMENT_NUMBERING_HREF;
  if (code.includes("RECONCILIATION") || code.includes("EXCEPTION")) return RECONCILIATION_RUNS_HREF;
  return ROUTES.admin.accountingPeriods;
}

function bridgeReconciliationHref(filters: { status?: string; financialYearId?: number | string | null; accountingPeriodId?: number | string | null }) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.financialYearId) params.set("financial_year", String(filters.financialYearId));
  if (filters.accountingPeriodId) params.set("accounting_period", String(filters.accountingPeriodId));
  const query = params.toString();
  return query ? `${ROUTES.admin.accountingBridgeReconciliation}?${query}` : ROUTES.admin.accountingBridgeReconciliation;
}

function issueList(title: string, items: YearEndIssue[], tone: "danger" | "warning") {
  const color = tone === "danger" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-950";
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <p className="text-sm font-semibold">{title}</p>
      {items.length === 0 ? <p className="mt-1 text-xs opacity-80">No items.</p> : (
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <div key={`${item.code}-${item.message}`} className="rounded-lg border border-current/20 bg-white/50 px-2 py-2 text-xs">
              <div><span className="font-semibold">{item.code}</span> · {item.message}</div>
              {item.recommended_action ? <div className="mt-1 opacity-90">{item.recommended_action}</div> : null}
              <Link href={actionHrefForIssue(item)} className="mt-2 inline-flex rounded-md border border-current/20 px-2 py-1 font-semibold">Open action</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function remediationSteps(readiness: YearEndReadiness | null) {
  const open = readiness?.open_period_count ?? 0;
  const unposted = readiness?.unposted_bridge_item_count ?? 0;
  const blocked = readiness?.blocked_bridge_item_count ?? 0;
  const mapping = readiness?.blocked_mapping_count ?? 0;
  const period = readiness?.blocked_period_count ?? 0;
  const numbering = readiness?.blocked_numbering_count ?? 0;
  const approval = readiness?.blocked_approval_count ?? 0;
  const unsupported = readiness?.unsupported_source_count ?? 0;
  const exceptions = readiness?.reconciliation_error_count ?? readiness?.exception_count ?? 0;
  const missingNumbering = readiness?.missing_numbering_profile_count ?? 0;
  return [
    { label: "OPEN_PERIODS", ok: open === 0, detail: open ? `${open} period(s) still OPEN` : "No open periods", href: ROUTES.admin.accountingPeriods },
    { label: "UNPOSTED_BRIDGE_ITEMS", ok: unposted === 0, detail: unposted ? `${unposted} READY_UNPOSTED row(s)` : "No unposted bridge blockers", href: bridgeReconciliationHref({ status: "READY_UNPOSTED", financialYearId: readiness?.financial_year?.id }) },
    { label: "BLOCKED_BY_MAPPING", ok: mapping === 0 && blocked === 0, detail: mapping || blocked ? `${mapping || blocked} mapping/setup blocker(s)` : "No blocked mapping rows", href: MAPPING_AUDIT_HREF },
    { label: "BLOCKED_BY_PERIOD", ok: period === 0, detail: period ? `${period} period readiness blocker(s)` : "No bridge period blocker", href: ROUTES.admin.accountingPeriods },
    { label: "BLOCKED_BY_NUMBERING", ok: numbering === 0 && missingNumbering === 0, detail: numbering || missingNumbering ? `${numbering || missingNumbering} numbering issue(s)` : "Numbering profile ready", href: DOCUMENT_NUMBERING_HREF },
    { label: "BLOCKED_BY_APPROVAL", ok: approval === 0, detail: approval ? `${approval} approval blocker(s)` : "No approval blocker", href: ROUTES.admin.accountingBridgeReconciliation },
    { label: "UNSUPPORTED_SOURCE", ok: unsupported === 0, detail: unsupported ? `${unsupported} unsupported source row(s)` : "No unsupported source blocker", href: MAPPING_AUDIT_HREF },
    { label: "RECONCILIATION_ERRORS", ok: exceptions === 0, detail: exceptions ? `${exceptions} exception(s)` : "No exceptions reported", href: RECONCILIATION_RUNS_HREF },
    { label: "LOCK_ELIGIBLE_PERIODS", ok: open === 0, detail: open ? "Use the accounting periods table below" : "No open period blocker", href: ROUTES.admin.accountingPeriods },
  ];
}

function closeBlockReason(readiness: YearEndReadiness | null): string {
  if (!readiness) return "Cannot close: readiness has not loaded.";
  if (readiness.ready_to_close) return readiness.requires_acknowledgement ? "Ready after explicit warning acknowledgement and confirmation text." : "Ready after confirmation text.";
  return CLOSE_BLOCKED_MESSAGE;
}

function activeBridgeEventRows(readiness: YearEndReadiness | null) {
  return Object.entries(readiness?.bridge_event_counts ?? {}).filter(([, counts]) =>
    (counts.READY_UNPOSTED ?? 0) > 0 ||
    (counts.BLOCKED_BY_MAPPING ?? 0) > 0 ||
    (counts.BLOCKED_BY_PERIOD ?? 0) > 0 ||
    (counts.BLOCKED_BY_NUMBERING ?? 0) > 0 ||
    (counts.EXCEPTION ?? 0) > 0,
  );
}

export default function YearEndClosePanel({ financialYears, activeFinancialYear, onChanged }: Props) {
  const [selectedFinancialYear, setSelectedFinancialYear] = useState<string>("");
  const [readiness, setReadiness] = useState<YearEndReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);

  const selectedValue = useMemo(() => selectedFinancialYear || (activeFinancialYear?.id ? String(activeFinancialYear.id) : ""), [activeFinancialYear?.id, selectedFinancialYear]);

  const loadReadiness = useCallback(async (financialYear = selectedValue) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getYearEndReadiness(financialYear || undefined);
      setReadiness(payload);
      setConfirmationText("");
      setAcknowledgeWarnings(false);
    } catch (err) {
      setReadiness(null);
      setError(accountingErrorMessage(err, "Failed to load year-end readiness."));
    } finally {
      setLoading(false);
    }
  }, [selectedValue]);

  useEffect(() => { void loadReadiness(selectedValue); }, [loadReadiness, selectedValue]);

  const requiredText = readiness?.confirmation_text_required ?? "";
  const canSubmit = Boolean(readiness?.ready_to_close) && confirmationText.trim() === requiredText && (!readiness?.requires_acknowledgement || acknowledgeWarnings);
  const steps = remediationSteps(readiness);
  const openPeriods = readiness?.open_periods ?? readiness?.periods?.filter((period) => period.status === "OPEN") ?? [];
  const unpostedReviewHref = bridgeReconciliationHref({ status: "READY_UNPOSTED", financialYearId: readiness?.financial_year?.id });
  const actionLinks = readiness?.action_links ?? {};
  const bridgeRows = activeBridgeEventRows(readiness);

  async function submitClose() {
    if (!readiness?.financial_year || !canSubmit) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await runYearEndClose({ financial_year: readiness.financial_year.id, confirmation_text: confirmationText, acknowledge_warnings: acknowledgeWarnings });
      setReadiness(result.readiness);
      setMessage(result.already_closed ? "Financial year was already closed." : `Financial year closed. ${result.closed_period_count ?? 0} period(s) updated.`);
      await onChanged();
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to close the financial year."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <WorkspaceSection title="Year-End Close" description="Controlled admin-only close workflow. Close is blocked until operational accounting blockers are resolved.">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm text-muted-foreground">Selected financial year<select className={accountingFieldClassName()} value={selectedValue} onChange={(event) => setSelectedFinancialYear(event.target.value)}><option value="">Active financial year</option>{financialYears.map((year) => <option key={year.id} value={year.id}>{year.code} {year.is_active ? "(active)" : ""}</option>)}</select></label>
          {metric("Status", readiness?.financial_year?.status ?? "Not ready")}
          {metric("Close safety", readiness?.ready_to_close ? "Ready" : "Blocked", undefined, readiness?.ready_to_close ? "good" : "danger")}
        </div>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div> : null}
        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message}</div> : null}
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{closeBlockReason(readiness)}</div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {metric("Open periods", readiness?.open_period_count ?? 0, openPeriods.length ? "Shown in period table below" : undefined, (readiness?.open_period_count ?? 0) ? "warning" : "good")}
          {metric("Locked periods", readiness?.locked_period_count ?? 0)}
          {metric("Closed periods", readiness?.closed_period_count ?? 0, undefined, (readiness?.closed_period_count ?? 0) ? "good" : "neutral")}
          {metric("Unposted bridge", readiness?.unposted_bridge_item_count ?? 0, undefined, (readiness?.unposted_bridge_item_count ?? 0) ? "warning" : "good")}
          {metric("Blocked mapping", readiness?.blocked_mapping_count ?? readiness?.blocked_bridge_item_count ?? 0, undefined, (readiness?.blocked_mapping_count ?? readiness?.blocked_bridge_item_count ?? 0) ? "warning" : "good")}
          {metric("Exceptions", readiness?.reconciliation_error_count ?? readiness?.exception_count ?? 0, undefined, (readiness?.reconciliation_error_count ?? readiness?.exception_count ?? 0) ? "danger" : "good")}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={actionLinks.bridge_reconciliation || unpostedReviewHref} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900">Review unposted bridge items</Link>
          <Link href={actionLinks.mapping_audit || MAPPING_AUDIT_HREF} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground">Open mapping audit</Link>
          <Link href={actionLinks.reconciliation_runs || RECONCILIATION_RUNS_HREF} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground">Run reconciliation checks</Link>
          <Link href={actionLinks.document_numbering || DOCUMENT_NUMBERING_HREF} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground">Open document numbering</Link>
          <Link href={actionLinks.finance_account_setup || FINANCE_ACCOUNTS_HREF} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground">Open finance accounts</Link>
        </div>

        <details className="rounded-xl border border-border bg-background p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-foreground">Open remediation checklist ({steps.filter((step) => !step.ok).length} blocker group(s))</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {steps.map((step, index) => (
              <div key={step.label} className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div><span className={step.ok ? "font-semibold text-emerald-700" : "font-semibold text-amber-800"}>{step.ok ? "✓" : "!"} {index + 1}. {step.label}</span><div className="text-xs text-muted-foreground">{step.detail}</div></div>
                <Link href={step.href} className="text-xs font-semibold text-primary underline underline-offset-4">Open</Link>
              </div>
            ))}
          </div>
        </details>

        <div className="grid gap-3 lg:grid-cols-2">{issueList("Blocking issues", readiness?.blocking_items ?? [], "danger")}{issueList("Warning issues", readiness?.warning_items ?? [], "warning")}</div>

        {openPeriods.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><span className="font-semibold">{openPeriods.length} open period(s) block year close.</span> Use the Accounting periods table below to lock or close eligible periods after daily posting/reconciliation review.</div> : null}

        {bridgeRows.length ? (
          <details className="rounded-xl border border-border bg-background p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-foreground">Show active bridge event blockers ({bridgeRows.length})</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {bridgeRows.map(([eventKey, counts]) => <div key={eventKey} className="rounded-lg border border-border px-3 py-2 text-xs"><div className="font-mono font-semibold">{eventKey}</div><div className="text-muted-foreground">Ready {counts.READY_UNPOSTED ?? 0} · Blocked {counts.BLOCKED_BY_MAPPING ?? 0} · Posted {counts.POSTED ?? 0}</div></div>)}
            </div>
          </details>
        ) : null}

        <div className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
          <p>Year-end readiness is read-only.</p>
          <p className="mt-1">Close does not renumber historical invoices, receipts, journals, or documents.</p>
          <p className="mt-1">Close does not auto-post bridge items or create adjustment journals.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2"><label className="text-sm text-muted-foreground">Confirmation text<input className={accountingFieldClassName()} value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} placeholder={requiredText || "Select a financial year"} />{requiredText ? <span className="mt-1 block text-xs">Required: {requiredText}</span> : null}</label><label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground"><input type="checkbox" checked={acknowledgeWarnings} onChange={(event) => setAcknowledgeWarnings(event.target.checked)} />Acknowledge warning items after admin review</label></div>
        <div className="flex flex-wrap items-center gap-3"><button type="button" className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void loadReadiness(selectedValue)} disabled={loading}>Refresh readiness</button><button type="button" className="inline-flex h-10 items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void submitClose()} disabled={!canSubmit || loading} title={closeBlockReason(readiness)}>{loading ? "Working..." : "Close year"}</button></div>
      </div>
    </WorkspaceSection>
  );
}
