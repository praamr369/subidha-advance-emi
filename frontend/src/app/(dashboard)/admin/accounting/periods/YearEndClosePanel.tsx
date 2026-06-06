"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { accountingDate, accountingErrorMessage, accountingFieldClassName } from "@/components/accounting/shared";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import type { FinancialYear } from "@/services/accounting";
import { getYearEndReadiness, runYearEndClose, type YearEndIssue, type YearEndReadiness } from "@/services/year-end-close";

const MAPPING_AUDIT_HREF = "/admin/accounting/setup/mapping-audit";
const DOCUMENT_NUMBERING_HREF = ROUTES.admin.settingsBusinessSetupDocumentNumbering;
const RECONCILIATION_RUNS_HREF = "/admin/reconciliation/runs";

const CLOSE_BLOCKED_MESSAGE = "Cannot close because open periods, unposted bridge items, or unresolved accounting blockers remain.";

type Props = {
  financialYears: FinancialYear[];
  activeFinancialYear: FinancialYear | null;
  onChanged: () => Promise<void> | void;
};

function metric(label: string, value: number | string) {
  return <div className="rounded-xl border border-border bg-background px-3 py-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold text-foreground">{value}</p></div>;
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

function issueList(title: string, items: YearEndIssue[], tone: "danger" | "warning") {
  const color = tone === "danger" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-950";
  return <div className={`rounded-xl border p-3 ${color}`}><p className="text-sm font-semibold">{title}</p>{items.length === 0 ? <p className="mt-1 text-xs opacity-80">No items.</p> : <div className="mt-2 space-y-2">{items.map((item) => <div key={`${item.code}-${item.message}`} className="rounded-lg border border-current/20 bg-white/50 px-2 py-2 text-xs"><div><span className="font-semibold">{item.code}</span> · {item.message}</div>{item.recommended_action ? <div className="mt-1 opacity-90">{item.recommended_action}</div> : null}<Link href={actionHrefForIssue(item)} className="mt-2 inline-flex rounded-md border border-current/20 px-2 py-1 font-semibold">Open action</Link></div>)}</div>}</div>;
}

function remediationSteps(readiness: YearEndReadiness | null) {
  const open = readiness?.open_period_count ?? 0;
  const unposted = readiness?.unposted_bridge_item_count ?? 0;
  const blocked = readiness?.blocked_bridge_item_count ?? 0;
  const exceptions = readiness?.exception_count ?? 0;
  const missingNumbering = readiness?.missing_numbering_profile_count ?? 0;
  const fy = readiness?.financial_year?.id ? { financial_year: String(readiness.financial_year.id) } : {};
  return [
    { label: "OPEN_PERIODS", ok: open === 0, detail: open ? `${open} period(s) still OPEN` : "No open periods", href: ROUTES.admin.accountingPeriods },
    { label: "UNPOSTED_BRIDGE_ITEMS", ok: unposted === 0, detail: unposted ? `${unposted} READY_UNPOSTED row(s)` : "No unposted bridge blockers", href: `${ROUTES.admin.accountingBridgeReconciliation}?${new URLSearchParams({ ...fy, status: "READY_UNPOSTED" }).toString()}` },
    { label: "BLOCKED_BY_MAPPING", ok: blocked === 0, detail: blocked ? `${blocked} blocked mapping item(s)` : "No blocked mapping warnings", href: MAPPING_AUDIT_HREF },
    { label: "BLOCKED_BY_NUMBERING", ok: missingNumbering === 0, detail: missingNumbering ? `${missingNumbering} numbering profile issue(s)` : "Numbering profile ready", href: DOCUMENT_NUMBERING_HREF },
    { label: "RECONCILIATION_ERRORS", ok: exceptions === 0, detail: exceptions ? `${exceptions} exception(s)` : "No exceptions reported", href: RECONCILIATION_RUNS_HREF },
    { label: "LOCK_ELIGIBLE_PERIODS", ok: open === 0, detail: open ? "Use period table Lock buttons" : "No open period blocker", href: ROUTES.admin.accountingPeriods },
  ];
}

function closeBlockReason(readiness: YearEndReadiness | null): string {
  if (!readiness) return "Cannot close: readiness has not loaded.";
  if (readiness.ready_to_close) return readiness.requires_acknowledgement ? "Ready after explicit warning acknowledgement and confirmation text." : "Ready after confirmation text.";
  return CLOSE_BLOCKED_MESSAGE;
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

  async function loadReadiness(financialYear = selectedValue) {
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
  }

  useEffect(() => { void loadReadiness(selectedValue); }, [selectedValue]);

  const requiredText = readiness?.confirmation_text_required ?? "";
  const canSubmit = Boolean(readiness?.ready_to_close) && confirmationText.trim() === requiredText && (!readiness?.requires_acknowledgement || acknowledgeWarnings);
  const steps = remediationSteps(readiness);
  const openPeriods = readiness?.open_periods ?? readiness?.periods?.filter((period) => period.status === "OPEN") ?? [];
  const unpostedReviewHref = `${ROUTES.admin.accountingBridgeReconciliation}?${new URLSearchParams({ ...(readiness?.financial_year?.id ? { financial_year: String(readiness.financial_year.id) } : {}), status: "READY_UNPOSTED" }).toString()}`;

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
      <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm text-muted-foreground">Selected financial year<select className={accountingFieldClassName()} value={selectedValue} onChange={(event) => setSelectedFinancialYear(event.target.value)}><option value="">Active financial year</option>{financialYears.map((year) => <option key={year.id} value={year.id}>{year.code} {year.is_active ? "(active)" : ""}</option>)}</select></label>
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p><p className="mt-1 font-semibold text-foreground">{readiness?.financial_year?.status ?? "Not ready"}</p></div>
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Close safety</p><p className={readiness?.ready_to_close ? "mt-1 font-semibold text-emerald-700" : "mt-1 font-semibold text-red-700"}>{readiness?.ready_to_close ? "Ready" : "Blocked"}</p></div>
        </div>
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div> : null}
        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message}</div> : null}
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{closeBlockReason(readiness)}</div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{metric("Open periods", readiness?.open_period_count ?? 0)}{metric("Locked periods", readiness?.locked_period_count ?? 0)}{metric("Closed periods", readiness?.closed_period_count ?? 0)}{metric("Unposted bridge", readiness?.unposted_bridge_item_count ?? 0)}{metric("Blocked mapping", readiness?.blocked_bridge_item_count ?? 0)}{metric("Exceptions", readiness?.exception_count ?? 0)}</div>
        <div className="grid gap-2 rounded-2xl border border-border bg-background p-3 text-sm"><p className="font-semibold text-foreground">Remediation checklist</p>{steps.map((step, index) => <div key={step.label} className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"><div><span className={step.ok ? "font-semibold text-emerald-700" : "font-semibold text-amber-800"}>{step.ok ? "✓" : "!"} {index + 1}. {step.label}</span><div className="text-xs text-muted-foreground">{step.detail}</div></div><Link href={step.href} className="text-xs font-semibold text-primary underline underline-offset-4">Open</Link></div>)}</div>
        <div className="grid gap-3 lg:grid-cols-2">{issueList("Blocking issues", readiness?.blocking_items ?? [], "danger")}{issueList("Warning issues", readiness?.warning_items ?? [], "warning")}</div>
        {openPeriods.length ? <div className="rounded-xl border border-border bg-background p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-foreground">Open periods blocking close</p><div className="flex flex-wrap gap-2"><Link href={ROUTES.admin.accountingPeriods} className="text-xs font-semibold text-primary underline underline-offset-4">Lock period</Link><Link href={unpostedReviewHref} className="text-xs font-semibold text-primary underline underline-offset-4">Review unposted bridge items</Link><Link href={MAPPING_AUDIT_HREF} className="text-xs font-semibold text-primary underline underline-offset-4">Open mapping audit</Link><Link href={RECONCILIATION_RUNS_HREF} className="text-xs font-semibold text-primary underline underline-offset-4">Run reconciliation checks</Link></div></div><div className="mt-2 grid gap-2 md:grid-cols-2">{openPeriods.slice(0, 8).map((period) => <div key={period.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"><div className="font-semibold">{period.code}</div><div className="mt-1 flex gap-3"><Link href={`${ROUTES.admin.accountingBridgeReconciliation}?accounting_period=${period.id}`} className="underline underline-offset-4">View reconciliation</Link><Link href={`${ROUTES.admin.accountingBridgeReconciliation}?accounting_period=${period.id}&status=READY_UNPOSTED`} className="underline underline-offset-4">View bridge items</Link></div></div>)}</div></div> : null}
        {readiness?.bridge_event_counts ? <div className="rounded-xl border border-border bg-background p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-foreground">Bridge event counts</p><div className="flex flex-wrap gap-2"><Link href={unpostedReviewHref} className="text-xs font-semibold text-primary underline underline-offset-4">Review unposted bridge items</Link><Link href={MAPPING_AUDIT_HREF} className="text-xs font-semibold text-primary underline underline-offset-4">Fix mapping blockers</Link><Link href={DOCUMENT_NUMBERING_HREF} className="text-xs font-semibold text-primary underline underline-offset-4">Open numbering setup</Link></div></div><div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{Object.entries(readiness.bridge_event_counts).filter(([, counts]) => (counts.READY_UNPOSTED ?? 0) > 0 || (counts.BLOCKED_BY_MAPPING ?? 0) > 0).map(([eventKey, counts]) => <div key={eventKey} className="rounded-lg border border-border px-3 py-2 text-xs"><div className="font-mono font-semibold">{eventKey}</div><div className="text-muted-foreground">Ready {counts.READY_UNPOSTED ?? 0} · Blocked {counts.BLOCKED_BY_MAPPING ?? 0} · Posted {counts.POSTED ?? 0}</div></div>)}</div></div> : null}
        <div className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">Existing invoice, receipt, journal, direct-sale, rent/lease, credit-note, debit-note, and delivery document numbers are preserved. This close workflow does not renumber history and does not auto-post bridge items.</div>
        <div className="grid gap-3 md:grid-cols-2"><label className="text-sm text-muted-foreground">Confirmation text<input className={accountingFieldClassName()} value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} placeholder={requiredText || "Select a financial year"} />{requiredText ? <span className="mt-1 block text-xs">Required: {requiredText}</span> : null}</label><label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground"><input type="checkbox" checked={acknowledgeWarnings} onChange={(event) => setAcknowledgeWarnings(event.target.checked)} />Acknowledge warning items after admin review</label></div>
        <div className="flex flex-wrap items-center gap-3"><button type="button" className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void loadReadiness(selectedValue)} disabled={loading}>Refresh readiness</button><button type="button" className="inline-flex h-10 items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void submitClose()} disabled={!canSubmit || loading} title={closeBlockReason(readiness)}>{loading ? "Working..." : "Close year"}</button></div>
        {readiness?.periods?.length ? <div className="overflow-x-auto rounded-xl border border-border bg-background"><table className="min-w-full divide-y divide-border text-xs"><thead className="bg-muted/40 text-left uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Period</th><th className="px-3 py-2">Dates</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Journals</th><th className="px-3 py-2">Invoices</th><th className="px-3 py-2">Receipts</th><th className="px-3 py-2">Actions</th></tr></thead><tbody className="divide-y divide-border">{readiness.periods.map((period) => <tr key={period.id}><td className="px-3 py-2 font-semibold text-foreground">{period.code}</td><td className="px-3 py-2 text-muted-foreground">{accountingDate(period.start_date)} – {accountingDate(period.end_date)}</td><td className="px-3 py-2">{period.status}</td><td className="px-3 py-2">{period.journal_count} · Dr {period.journal_debit_total} / Cr {period.journal_credit_total}</td><td className="px-3 py-2">{period.invoice_count} · {period.invoice_total}</td><td className="px-3 py-2">{period.receipt_count} · {period.receipt_total}</td><td className="px-3 py-2"><div className="flex flex-wrap gap-2"><Link href={`${ROUTES.admin.accountingBridgeReconciliation}?accounting_period=${period.id}`} className="underline underline-offset-4">View reconciliation</Link><Link href={`${ROUTES.admin.accountingBridgeReconciliation}?accounting_period=${period.id}&status=READY_UNPOSTED`} className="underline underline-offset-4">View bridge items</Link></div></td></tr>)}</tbody></table></div> : null}
      </div>
    </WorkspaceSection>
  );
}
