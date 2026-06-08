"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { AccountingNotice, AccountingRefreshButton, accountingDate, accountingErrorMessage, accountingFieldClassName } from "@/components/accounting/shared";
import { AccountingControlShell } from "@/components/layout/page-shells";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { MetricStrip } from "@/components/ui/operations";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { generateCurrentAccountingPeriod } from "@/services/accounting-period-actions";
import { getAccountingBridgeReconciliation, type AccountingBridgeReconciliationSummary } from "@/services/accounting-bridge-reconciliation";
import { seedSupportedAccountingMappings } from "@/services/accounting-mapping-remediation";
import type { AccountingPeriod, AccountingPeriodReadiness, AccountingPeriodStatus, FinancialYear, PostingLock } from "@/services/accounting";
import { activateFinancialYear, closeAccountingPeriod, createFinancialYear, createPostingLock, generateAccountingPeriods, getAccountingPeriodsReadiness, listAccountingPeriods, listFinancialYears, listPostingLocks, lockAccountingPeriod, removePostingLock, reopenAccountingPeriod } from "@/services/accounting";
import YearEndClosePanel from "./YearEndClosePanel";

const STATUS_LABEL: Record<AccountingPeriodStatus, string> = { OPEN: "Open", LOCKED: "Locked", CLOSED: "Closed" };
const MAPPING_AUDIT_HREF = "/admin/accounting/setup/mapping-audit";
const RECONCILIATION_RUNS_HREF = "/admin/reconciliation/runs";

function bridgeReviewHref(filters: { source_model?: string; status?: string; accounting_period?: number | string }) {
  const params = new URLSearchParams();
  if (filters.source_model) params.set("source_model", filters.source_model);
  if (filters.status) params.set("status", filters.status);
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

function readinessItems(readiness: AccountingPeriodReadiness | null) {
  if (!readiness) return [];
  return [
    { label: "Active financial year", ok: Boolean(readiness.active_financial_year), detail: readiness.active_financial_year?.code || "Not configured" },
    { label: "Current period", ok: Boolean(readiness.current_period), detail: readiness.current_period?.code || "No period covers today" },
    { label: "Posting lock", ok: !readiness.posting_lock, detail: readiness.posting_lock ? `Locked on ${readiness.posting_lock.lock_date}` : "No exact-date lock today" },
    { label: "Posting readiness", ok: readiness.is_ready, detail: readiness.is_ready ? "Ready" : "Blocked" },
  ];
}

function blockerGroups(readiness: AccountingPeriodReadiness | null, locks: PostingLock[], bridgeSummary: AccountingBridgeReconciliationSummary | null) {
  const errors = readiness?.errors ?? [];
  const warnings = readiness?.warnings ?? [];
  const text = [...errors, ...warnings].join(" ").toLowerCase();
  const mappingBlocked = summaryCount(bridgeSummary, "blocked_by_mapping_count");
  const periodBlocked = summaryCount(bridgeSummary, "blocked_by_period_count");
  const numberingBlocked = summaryCount(bridgeSummary, "blocked_by_numbering_count");
  const approvalRequired = summaryCount(bridgeSummary, "blocked_by_approval_count");
  const unsupported = summaryCount(bridgeSummary, "unsupported_source_count", summaryCount(bridgeSummary, "unsupported_count"));
  const exceptions = summaryCount(bridgeSummary, "reconciliation_exception_count", summaryCount(bridgeSummary, "exception_count"));
  return [
    {
      title: "Setup blockers",
      detail: text.includes("financial year") ? "Financial year setup is incomplete." : "No setup blocker exposed.",
      count: text.includes("financial year") ? 1 : 0,
      href: ROUTES.admin.accountingPeriods,
    },
    {
      title: "Mapping blockers",
      detail: "Open mapping audit to resolve posting profile and COA blockers before close.",
      count: mappingBlocked || (text.includes("mapping") ? 1 : 0),
      href: MAPPING_AUDIT_HREF,
    },
    {
      title: "Bridge posting blockers",
      detail: "Open periods are valid for posting. Period close still waits for posting and reconciliation to finish.",
      count: summaryCount(bridgeSummary, "ready_unposted_count") + summaryCount(bridgeSummary, "posted_unverified_count"),
      href: ROUTES.admin.accountingBridgeReconciliation,
    },
    {
      title: "Numbering blockers",
      detail: text.includes("number") ? "Document or journal numbering is incomplete." : "No numbering blocker exposed.",
      count: numberingBlocked || (text.includes("number") ? 1 : 0),
      href: ROUTES.admin.settingsBusinessSetupDocumentNumbering,
    },
    {
      title: "Period lock blockers",
      detail: readiness?.posting_lock ? `Posting is locked for ${readiness.posting_lock.lock_date}.` : `${locks.length} configured lock(s).`,
      count: periodBlocked || (readiness?.posting_lock ? 1 : 0),
      href: ROUTES.admin.accountingPeriods,
    },
    {
      title: "Other bridge blockers",
      detail: `${unsupported} unsupported, ${approvalRequired} approval required, ${exceptions} exception(s).`,
      count: unsupported + approvalRequired + exceptions,
      href: ROUTES.admin.accountingBridgeReconciliation,
    },
  ];
}

function BridgeCloseReadinessSplit({ summary }: { summary: AccountingBridgeReconciliationSummary | null }) {
  const paymentReady = summaryCount(summary, "payment_ready_unposted_count");
  const paymentPostedUnverified = summaryCount(summary, "payment_posted_unverified_count");
  const paymentReconciled = summaryCount(summary, "payment_reconciled_count");
  const receiptReady = summaryCount(summary, "receipt_ready_unposted_count");
  const receiptPostedUnverified = summaryCount(summary, "receipt_posted_unverified_count");
  const receiptReconciled = summaryCount(summary, "receipt_reconciled_count");
  const otherRows = [
    { label: "Unsupported", value: summaryCount(summary, "unsupported_source_count", summaryCount(summary, "unsupported_count")), href: bridgeReviewHref({ status: "UNSUPPORTED" }) },
    { label: "Approval required", value: summaryCount(summary, "blocked_by_approval_count"), href: bridgeReviewHref({ status: "BLOCKED" }) },
    { label: "Mapping blocked", value: summaryCount(summary, "blocked_by_mapping_count"), href: MAPPING_AUDIT_HREF },
    { label: "Period blocked", value: summaryCount(summary, "blocked_by_period_count"), href: ROUTES.admin.accountingPeriods },
    { label: "Numbering blocked", value: summaryCount(summary, "blocked_by_numbering_count"), href: ROUTES.admin.settingsBusinessSetupDocumentNumbering },
    { label: "Exceptions", value: summaryCount(summary, "reconciliation_exception_count", summaryCount(summary, "exception_count")), href: RECONCILIATION_RUNS_HREF },
  ];
  const sourceSections = [
    {
      title: "Payment bridge",
      action: "Review Payment bridge items",
      href: bridgeReviewHref({ source_model: "Payment" }),
      rows: [
        { label: "Ready unposted", value: paymentReady, detail: "Setup is ready, but journal has not been posted.", href: bridgeReviewHref({ source_model: "Payment", status: "READY_UNPOSTED" }) },
        { label: "Posted unverified", value: paymentPostedUnverified, detail: "Journal exists, but reconciliation verification is pending.", href: bridgeReviewHref({ source_model: "Payment", status: "POSTED_UNVERIFIED" }) },
        { label: "Reconciled", value: paymentReconciled, detail: "Bridge posting has passed verification.", href: bridgeReviewHref({ source_model: "Payment", status: "RECONCILED" }) },
      ],
    },
    {
      title: "Receipt bridge",
      action: "Review Receipt bridge items",
      href: bridgeReviewHref({ source_model: "ReceiptDocument" }),
      rows: [
        { label: "Ready unposted", value: receiptReady, detail: "Setup is ready, but journal has not been posted.", href: bridgeReviewHref({ source_model: "ReceiptDocument", status: "READY_UNPOSTED" }) },
        { label: "Posted unverified", value: receiptPostedUnverified, detail: "Journal exists, but reconciliation verification is pending.", href: bridgeReviewHref({ source_model: "ReceiptDocument", status: "POSTED_UNVERIFIED" }) },
        { label: "Reconciled", value: receiptReconciled, detail: "Bridge posting has passed verification.", href: bridgeReviewHref({ source_model: "ReceiptDocument", status: "RECONCILED" }) },
      ],
    },
  ];

  return (
    <WorkspaceSection title="Bridge close readiness by source" description="Open periods are valid for posting. Period close still waits for posting and reconciliation to finish.">
      <div className="grid gap-4 xl:grid-cols-3">
        {sourceSections.map((section) => (
          <div key={section.title} className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold text-foreground">{section.title}</div>
              <Link href={section.href} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground">{section.action}</Link>
            </div>
            <div className="mt-3 grid gap-2">
              {section.rows.map((row) => (
                <Link key={`${section.title}-${row.label}`} href={row.href} className="rounded-lg border border-border/70 px-3 py-2 text-sm hover:bg-muted/40">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-foreground">{row.label}</span>
                    <span className="text-lg font-semibold text-foreground">{row.value}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.detail}</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="font-semibold text-foreground">Other bridge</div>
          <div className="mt-3 grid gap-2">
            {otherRows.map((row) => (
              <Link key={row.label} href={row.href} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm hover:bg-muted/40">
                <span className="font-medium text-foreground">{row.label}</span>
                <span className={row.value ? "font-semibold text-amber-800" : "font-semibold text-muted-foreground"}>{row.value}</span>
              </Link>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={bridgeReviewHref({ status: "POSTED_UNVERIFIED" })} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900">Review posted unverified</Link>
            <Link href={RECONCILIATION_RUNS_HREF} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground">Run reconciliation checks</Link>
          </div>
        </div>
      </div>
    </WorkspaceSection>
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
  const currentPeriodMissing = Boolean(readiness?.errors?.some((item) => item.toLowerCase().includes("period") && item.toLowerCase().includes("posting date")) || (readiness && !readiness.current_period));
  const groupedBlockers = useMemo(() => blockerGroups(readiness, locks, bridgeSummary), [bridgeSummary, locks, readiness]);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const [fyPayload, periodPayload, lockPayload, readinessPayload, bridgePayload] = await Promise.all([listFinancialYears(), listAccountingPeriods(), listPostingLocks(), getAccountingPeriodsReadiness(), getAccountingBridgeReconciliation()]);
      setFinancialYears(fyPayload.results);
      setPeriods(periodPayload.results);
      setLocks(lockPayload.results);
      setReadiness(readinessPayload);
      setBridgeSummary(bridgePayload.summary);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load accounting period controls."));
      if (mode === "initial") { setFinancialYears([]); setPeriods([]); setLocks([]); setReadiness(null); setBridgeSummary(null); }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => { void loadPage("initial"); }, []);

  async function handleCreateFinancialYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await createFinancialYear(fyForm); setNotice("Financial year created."); setFyForm({ code: "", name: "", start_date: "", end_date: "", notes: "" }); await loadPage("refresh"); } catch (err) { setNotice(null); setError(accountingErrorMessage(err, "Failed to create the financial year.")); }
  }

  async function handleCreateLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await createPostingLock(lockForm); setNotice("Posting lock created."); setLockForm((current) => ({ ...current, reason: "" })); await loadPage("refresh"); } catch (err) { setNotice(null); setError(accountingErrorMessage(err, "Failed to create the posting lock.")); }
  }

  async function handleGenerateCurrentPeriod() {
    setActionBusy("period");
    try { const result = await generateCurrentAccountingPeriod(); setNotice(result.detail || "Current accounting period generated or confirmed."); await loadPage("refresh"); } catch (err) { setNotice(null); setError(accountingErrorMessage(err, "Failed to generate current accounting period.")); } finally { setActionBusy(null); }
  }

  async function handleSeedMappings() {
    setActionBusy("seed");
    try { const result = await seedSupportedAccountingMappings(); setNotice(`Supported mappings seeded. Journals created: ${result.journal_entries_created}; numbering profiles created: ${result.document_sequences_allocated}.`); await loadPage("refresh"); } catch (err) { setNotice(null); setError(accountingErrorMessage(err, "Failed to seed supported mappings.")); } finally { setActionBusy(null); }
  }

  async function changePeriodStatus(period: AccountingPeriod, status: AccountingPeriodStatus) {
    const reason = `${STATUS_LABEL[status]} from admin accounting period cockpit.`;
    if (status === "OPEN") await reopenAccountingPeriod(period.id, reason);
    else if (status === "LOCKED") await lockAccountingPeriod(period.id, reason);
    else await closeAccountingPeriod(period.id, reason);
    setNotice(`Period ${period.code} moved to ${STATUS_LABEL[status]}.`);
    await loadPage("refresh");
  }

  const periodColumns: EnterpriseColumnDef<AccountingPeriod>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name", render: (row) => row.name || row.label },
    { key: "financial_year_code", header: "FY", render: (row) => row.financial_year_code || "-" },
    { key: "start_date", header: "Start", render: (row) => accountingDate(row.start_date) },
    { key: "end_date", header: "End", render: (row) => accountingDate(row.end_date) },
    { key: "status", header: "Status", render: (row) => { const status = statusForPeriod(row); const byline = row.locked_by_username ? ` by ${row.locked_by_username}` : ""; return status === "OPEN" ? "Open" : `${STATUS_LABEL[status]}${byline}`; } },
    { key: "actions", header: "Actions", render: (row) => { const status = statusForPeriod(row); const bridgeHref = `${ROUTES.admin.accountingBridgeReconciliation}?accounting_period=${row.id}`; const readyHref = `${ROUTES.admin.accountingBridgeReconciliation}?accounting_period=${row.id}&status=READY_UNPOSTED`; return <div className="flex flex-wrap gap-2">{status !== "OPEN" ? <ConfirmActionButton label="Open" title={`Open ${row.code}?`} description="Opening restores posting into this accounting period. This is audited." onConfirm={() => changePeriodStatus(row, "OPEN")} variant="primary" /> : null}{status !== "LOCKED" ? <ConfirmActionButton label="Lock" title={`Lock ${row.code}?`} description="Locking blocks accounting postings until an admin opens the period." onConfirm={() => changePeriodStatus(row, "LOCKED")} variant="secondary" /> : null}{status !== "CLOSED" ? <ConfirmActionButton label="Close" title={`Close ${row.code}?`} description="Closing blocks accounting postings and marks the period as closed." onConfirm={() => changePeriodStatus(row, "CLOSED")} variant="destructive" /> : null}<Link href={bridgeHref} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground">View reconciliation</Link><Link href={readyHref} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900">View bridge items</Link></div>; } },
  ];

  const fyColumns: EnterpriseColumnDef<FinancialYear>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    { key: "start_date", header: "Start", render: (row) => accountingDate(row.start_date) },
    { key: "end_date", header: "End", render: (row) => accountingDate(row.end_date) },
    { key: "is_active", header: "Status", render: (row) => (row.is_active ? "Active" : "Inactive") },
    { key: "actions", header: "Actions", render: (row) => <div className="flex flex-wrap gap-2">{!row.is_active ? <ConfirmActionButton label="Activate" title={`Activate ${row.code}?`} description="This financial year becomes the source of truth for accounting posting validation." onConfirm={async () => { await activateFinancialYear(row.id); setNotice(`${row.code} activated.`); await loadPage("refresh"); }} variant="primary" /> : null}<ConfirmActionButton label="Generate" title={`Generate monthly periods for ${row.code}?`} description="Only missing compatible monthly accounting periods are created or linked." onConfirm={async () => { const result = await generateAccountingPeriods(row.id); setNotice(`${result.created_count || 0} period(s) created for ${row.code}.`); await loadPage("refresh"); }} variant="secondary" /></div> },
  ];

  const lockColumns: EnterpriseColumnDef<PostingLock>[] = [
    { key: "lock_date", header: "Lock Date", render: (row) => accountingDate(row.lock_date) },
    { key: "locked_by_username", header: "Locked By", render: (row) => row.locked_by_username || "-" },
    { key: "reason", header: "Reason", render: (row) => row.reason || "-" },
    { key: "actions", header: "Actions", render: (row) => <ConfirmActionButton label="Remove" title={`Remove ${row.lock_date} lock?`} description="This removes the exact-date posting lock and restores posting for that day if the period is open." onConfirm={async () => { await removePostingLock(row.id); setNotice(`Posting lock for ${row.lock_date} removed.`); await loadPage("refresh"); }} variant="destructive" /> },
  ];

  return (
    <PortalPage title="Accounting Period Cockpit" subtitle="Control the active financial year, monthly accounting periods, exact-date posting locks, and controlled year-end close." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Periods" }]} actions={[{ href: ROUTES.admin.accountingBooks, label: "Books", variant: "secondary" }, { href: ROUTES.admin.accountingBridgeReconciliation, label: "Bridge Reconciliation", variant: "secondary" }]} statusBadge={{ label: "Admin Only", tone: "info" }}>
      <AccountingControlShell readinessWarnings={<div className="space-y-4"><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={Boolean(actionBusy)} onClick={() => void handleSeedMappings()} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">{actionBusy === "seed" ? "Seeding..." : "Seed supported mappings"}</button>{currentPeriodMissing ? <button type="button" disabled={Boolean(actionBusy)} onClick={() => void handleGenerateCurrentPeriod()} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">{actionBusy === "period" ? "Generating..." : "Generate missing current period"}</button> : null}<Link href={ROUTES.admin.accountingBridgeReconciliation} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">Review bridge reconciliation</Link><Link href={bridgeReviewHref({ source_model: "Payment" })} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">Review Payment bridge items</Link><Link href={bridgeReviewHref({ source_model: "ReceiptDocument" })} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">Review Receipt bridge items</Link><Link href={bridgeReviewHref({ status: "POSTED_UNVERIFIED" })} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">Review posted unverified</Link><Link href={RECONCILIATION_RUNS_HREF} className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground">Run reconciliation checks</Link><Link href={MAPPING_AUDIT_HREF} className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground">Open mapping audit</Link><Link href={ROUTES.admin.settingsBusinessSetupDocumentNumbering} className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground">Open document numbering</Link><AccountingRefreshButton loading={loading} refreshing={refreshing} onClick={() => void loadPage("refresh")} /></div>{notice ? <AccountingNotice message={notice} /> : null}{!loading ? <MetricStrip items={[{ label: "Financial years", value: String(financialYears.length) }, { label: "Periods", value: String(periods.length) }, { label: "Posting locks", value: String(locks.length) }, { label: "Payment ready", value: String(bridgeSummary?.payment_ready_unposted_count ?? 0) }, { label: "Receipt ready", value: String(bridgeSummary?.receipt_ready_unposted_count ?? 0) }, { label: "Posted unverified", value: String(bridgeSummary?.posted_unverified_count ?? 0) }, { label: "Unsupported sources", value: String(bridgeSummary?.unsupported_source_count ?? bridgeSummary?.unsupported_count ?? 0) }]} /> : null}<BridgeCloseReadinessSplit summary={bridgeSummary} /><WorkspaceSection title="Active Financial Year" description="Posting validation resolves against this year.">{activeFinancialYear ? <div className="grid gap-3 text-sm md:grid-cols-2"><div><p className="text-muted-foreground">Code</p><p className="font-medium text-foreground">{activeFinancialYear.code}</p></div><div><p className="text-muted-foreground">Current period</p><p className="font-medium text-foreground">{readiness?.current_period?.code || "No current period"}</p></div><div><p className="text-muted-foreground">Start</p><p className="font-medium text-foreground">{accountingDate(activeFinancialYear.start_date)}</p></div><div><p className="text-muted-foreground">End</p><p className="font-medium text-foreground">{accountingDate(activeFinancialYear.end_date)}</p></div></div> : <p className="text-sm text-muted-foreground">No active financial year is configured.</p>}</WorkspaceSection><WorkspaceSection title="Close blocker groups" description="Posting blockers and close blockers are shown separately. Open periods can accept bridge postings during daily operations; month/year close can still require clean bridge and reconciliation readiness."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">{groupedBlockers.map((group) => <div key={group.title} className={group.count ? "rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" : "rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground"}><div className="font-semibold text-foreground">{group.title}</div><div className="mt-1 text-xs">{group.detail}</div><Link href={group.href} className="mt-3 inline-flex rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground">Open fixing page</Link></div>)}</div></WorkspaceSection><WorkspaceSection title="Remediation checklist" description="Close year remains blocked until real blockers are resolved."><div className="grid gap-2">{readinessItems(readiness).map((item) => <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm"><span className="font-medium text-foreground">{item.label}</span><span className={item.ok ? "text-emerald-700" : "text-destructive"}>{item.detail}</span></div>)}{readiness?.errors.map((item) => <p key={item} className="text-sm text-destructive">{item}</p>)}{readiness?.warnings.map((item) => <p key={item} className="text-sm text-amber-700">{item}</p>)}<div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">Open periods are valid for posting. Period close still waits for posting and reconciliation to finish.</div></div></WorkspaceSection><YearEndClosePanel financialYears={financialYears} activeFinancialYear={activeFinancialYear} onChanged={() => loadPage("refresh")} /></div>} primaryRegister={<div className="space-y-6"><EnterpriseDataTable data={periods} columns={periodColumns} loading={loading} error={error} onRetry={() => void loadPage("initial")} emptyTitle="No accounting periods configured" emptyDescription="Create a financial year and generate monthly periods before accounting posting can proceed." /><WorkspaceSection title="Posting Locks" description="Exact-date locks remain available as a secondary posting control."><EnterpriseDataTable data={locks} columns={lockColumns} loading={loading} error={error} onRetry={() => void loadPage("initial")} emptyTitle="No posting locks configured" emptyDescription="Create exact-date posting locks for sensitive close dates or controlled correction windows." /></WorkspaceSection></div>} controlPanel={<div className="space-y-4"><WorkspaceSection title="Create Financial Year" description="Financial years are inactive until an admin activates one."><form className="grid gap-3" onSubmit={handleCreateFinancialYear}><label className="text-sm text-muted-foreground">Code<input className={accountingFieldClassName()} value={fyForm.code} onChange={(event) => setFyForm((current) => ({ ...current, code: event.target.value }))} required /></label><label className="text-sm text-muted-foreground">Name<input className={accountingFieldClassName()} value={fyForm.name} onChange={(event) => setFyForm((current) => ({ ...current, name: event.target.value }))} required /></label><label className="text-sm text-muted-foreground">Start date<input type="date" className={accountingFieldClassName()} value={fyForm.start_date} onChange={(event) => setFyForm((current) => ({ ...current, start_date: event.target.value }))} required /></label><label className="text-sm text-muted-foreground">End date<input type="date" className={accountingFieldClassName()} value={fyForm.end_date} onChange={(event) => setFyForm((current) => ({ ...current, end_date: event.target.value }))} required /></label><label className="text-sm text-muted-foreground">Notes<textarea className={accountingFieldClassName()} value={fyForm.notes} onChange={(event) => setFyForm((current) => ({ ...current, notes: event.target.value }))} /></label><button type="submit" className="inline-flex h-10 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90">Create Financial Year</button></form></WorkspaceSection><WorkspaceSection title="Financial Years" description="Activate one financial year and generate monthly periods."><EnterpriseDataTable data={financialYears} columns={fyColumns} loading={loading} error={error} onRetry={() => void loadPage("initial")} emptyTitle="No financial years configured" emptyDescription="Create a financial year before generating periods." /></WorkspaceSection><WorkspaceSection title="Create Posting Lock" description="Exact-date locks block posting for one specific date."><form className="grid gap-3" onSubmit={handleCreateLock}><label className="text-sm text-muted-foreground">Lock date<input type="date" className={accountingFieldClassName()} value={lockForm.lock_date} onChange={(event) => setLockForm((current) => ({ ...current, lock_date: event.target.value }))} required /></label><label className="text-sm text-muted-foreground">Reason<textarea className={accountingFieldClassName()} value={lockForm.reason} onChange={(event) => setLockForm((current) => ({ ...current, reason: event.target.value }))} /></label><button type="submit" className="inline-flex h-10 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90">Create Lock</button></form></WorkspaceSection></div>} />
    </PortalPage>
  );
}
