"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  getAccountingBridgeReconciliation,
  type AccountingBridgeReconciliationFilters,
  type AccountingBridgeReconciliationPayload,
  type AccountingBridgeReconciliationRow,
} from "@/services/accounting-bridge-reconciliation";
import {
  applyAccountingMappingRemediation,
  createAccountingMappingRemediationAccount,
  getAccountingMappingRemediation,
  type AccountingMappingRemediationPayload,
  type AccountingMappingRemediationRow,
} from "@/services/accounting-mapping-remediation";

const STATUS_OPTIONS = ["", "READY_UNPOSTED", "BLOCKED_BY_MAPPING", "BLOCKED_BY_POSTING_APPROVAL", "POSTED", "SETTLED", "RECONCILED", "EXCEPTION"];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusClass(status: string): string {
  const value = status.toUpperCase();
  if (["OPEN", "RECONCILED", "SETTLED", "POSTED", "READY"].includes(value)) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (value === "READY_UNPOSTED") return "border-blue-200 bg-blue-50 text-blue-900";
  if (value === "LOCKED" || value.startsWith("BLOCKED") || value === "MISSING_ACCOUNT" || value === "ACCOUNT_EXISTS_UNMAPPED") return "border-amber-200 bg-amber-50 text-amber-950";
  if (value === "CLOSED" || value === "EXCEPTION" || value === "UNSUPPORTED_SOURCE") return "border-red-200 bg-red-50 text-red-900";
  return "border-slate-200 bg-slate-50 text-slate-900";
}

function SummaryCard({ label, value, tone, href }: { label: string; value: number | string; tone: string; href?: string }) {
  const body = <div className={cx("rounded-2xl border p-4 shadow-sm", tone)}><div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
  return href ? <Link href={href}>{body}</Link> : body;
}

function sourceLabel(row: AccountingBridgeReconciliationRow): string {
  const model = row.source_model || row.module || "Source";
  const id = row.source_id ? `#${row.source_id}` : "registry";
  return `${model} ${id}`;
}

function rowKey(row: AccountingBridgeReconciliationRow): string {
  return `${row.row_type}-${row.event_key}-${row.source_model ?? "registry"}-${row.source_id ?? "none"}-${row.status}`;
}

function filtersFromLocation(): AccountingBridgeReconciliationFilters {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    financial_year: params.get("financial_year") || undefined,
    accounting_period: params.get("accounting_period") || undefined,
    status: params.get("status") || undefined,
    event_key: params.get("event_key") || undefined,
    module: params.get("module") || undefined,
    source_model: params.get("source_model") || undefined,
  };
}

function remediationLabel(row: AccountingBridgeReconciliationRow, remediation?: AccountingMappingRemediationRow) {
  if (row.event_key === "inventory_delivery_out") return remediation?.existing_account_id ? "Map COGS Account" : "Create COGS Account";
  if (row.event_key === "manufacturing_wastage") return remediation?.existing_account_id ? "Map Wastage Account" : "Create Wastage Expense Account";
  if (row.event_key === "staff_advance") return "Unsupported Source";
  return remediation?.action_label || "Fix mapping";
}

export default function AccountingBridgeReconciliationPage() {
  const [payload, setPayload] = useState<AccountingBridgeReconciliationPayload | null>(null);
  const [remediation, setRemediation] = useState<AccountingMappingRemediationPayload | null>(null);
  const [filters, setFilters] = useState<AccountingBridgeReconciliationFilters>({});
  const [draftFilters, setDraftFilters] = useState<AccountingBridgeReconciliationFilters>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(nextFilters = filters, opts: { silent?: boolean } = {}) {
    if (opts.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [bridgePayload, remediationPayload] = await Promise.all([
        getAccountingBridgeReconciliation(nextFilters),
        getAccountingMappingRemediation(),
      ]);
      setPayload(bridgePayload);
      setRemediation(remediationPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bridge reconciliation cockpit.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const initial = filtersFromLocation();
    setFilters(initial);
    setDraftFilters(initial);
    void load(initial);
  }, []);

  const remediationByEvent = useMemo(() => {
    const map = new Map<string, AccountingMappingRemediationRow>();
    for (const row of remediation?.rows ?? []) map.set(row.event_type, row);
    return map;
  }, [remediation]);

  const rows = payload?.results ?? [];
  const exceptionRows = rows.filter((row) => row.status === "EXCEPTION" || row.exception_reasons.length > 0 || row.status.startsWith("BLOCKED") || row.event_key === "staff_advance");
  const readyRows = rows.filter((row) => row.status === "READY_UNPOSTED");
  const blockedRows = rows.filter((row) => row.status.startsWith("BLOCKED") || row.event_key === "staff_advance");
  const selectedFinancialYear = payload?.selected_financial_year ?? payload?.accounting_period_readiness?.active_financial_year ?? payload?.financial_year_readiness?.active_financial_year ?? null;
  const selectedPeriod = payload?.selected_accounting_period ?? payload?.accounting_period_readiness?.current_period ?? payload?.financial_year_readiness?.current_period ?? null;
  const readinessBlockers = payload?.readiness_blockers ?? payload?.accounting_period_readiness?.blockers ?? payload?.financial_year_readiness?.blockers ?? [];
  const availableFinancialYears = payload?.available_financial_years ?? [];
  const availablePeriods = payload?.available_accounting_periods ?? [];
  const summary = payload?.summary ?? { source_count: 0, ready_unposted_count: 0, blocked_count: 0, posted_count: 0, settled_count: 0, reconciled_count: 0, exception_count: 0 };
  const unpostedHref = `${ROUTES.admin.accountingBridgeReconciliation}?${new URLSearchParams({ ...(selectedFinancialYear?.id ? { financial_year: String(selectedFinancialYear.id) } : {}), status: "READY_UNPOSTED" }).toString()}`;
  const blockedHref = `${ROUTES.admin.accountingBridgeReconciliation}?${new URLSearchParams({ ...(selectedFinancialYear?.id ? { financial_year: String(selectedFinancialYear.id) } : {}), status: "BLOCKED_BY_MAPPING" }).toString()}`;

  function setDraft(key: keyof AccountingBridgeReconciliationFilters, value: string) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setFilters(draftFilters);
    void load(draftFilters);
  }

  function clearFilters() {
    setDraftFilters({});
    setFilters({});
    void load({});
  }

  async function handleCreateAccount(eventType: string) {
    setActionBusy(`${eventType}:create`);
    setNotice(null);
    try {
      await createAccountingMappingRemediationAccount(eventType);
      setNotice("Missing chart account created or confirmed. No journal or bridge posting was created.");
      await load(filters, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create missing chart account.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleApplyMapping(eventType: string, accountId?: number | null) {
    setActionBusy(`${eventType}:map`);
    setNotice(null);
    try {
      await applyAccountingMappingRemediation(eventType, accountId);
      setNotice("Posting profile mapping applied or confirmed. No journal or bridge posting was created.");
      await load(filters, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply mapping.");
    } finally {
      setActionBusy(null);
    }
  }

  function rowAction(row: AccountingBridgeReconciliationRow) {
    const current = remediationByEvent.get(row.event_key);
    if (row.event_key === "staff_advance" || current?.status === "UNSUPPORTED_SOURCE") {
      return <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"><div className="font-semibold">Not available</div><div>StaffAdvance workflow not enabled. No Post button is available.</div></div>;
    }
    if (row.status === "READY_UNPOSTED") {
      const canPost = Boolean(row.post_action_href && row.can_post && row.period_status === "OPEN");
      return <div className="flex flex-col gap-2 text-xs"><Link href={row.preview_action_href || ROUTES.admin.accountingBridges} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-900">Preview posting</Link>{canPost ? <Link href={row.post_action_href || ROUTES.admin.accountingBridges} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-900">Post</Link> : <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">Post disabled: mapping, open period, FY, and JOURNAL_ENTRY numbering must be ready through controlled bridge posting.</span>}{row.source_action_href ? <Link href={row.source_action_href} className="underline underline-offset-4">Open source</Link> : null}</div>;
    }
    if (row.status.startsWith("BLOCKED") || current?.status === "MISSING_ACCOUNT" || current?.status === "ACCOUNT_EXISTS_UNMAPPED") {
      return <div className="flex flex-col gap-2 text-xs">{current?.can_auto_create_account ? <button type="button" disabled={actionBusy === `${row.event_key}:create`} onClick={() => void handleCreateAccount(row.event_key)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left font-semibold text-amber-950">{actionBusy === `${row.event_key}:create` ? "Creating..." : remediationLabel(row, current)}</button> : null}{current?.can_map_account ? <button type="button" disabled={actionBusy === `${row.event_key}:map`} onClick={() => void handleApplyMapping(row.event_key, current.existing_account_id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left font-semibold text-emerald-900">{actionBusy === `${row.event_key}:map` ? "Mapping..." : remediationLabel(row, current)}</button> : null}<Link href={current?.action_href || row.action_href || ROUTES.admin.accountingSetup} className="rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground">Open COA / Mapping Setup</Link><span className="text-muted-foreground">{current?.recommended_action || row.recommended_action || row.operator_action}</span></div>;
    }
    if (row.journal_entry?.id) return <Link href={`${ROUTES.admin.accountingJournals}/${row.journal_entry.id}`} className="text-xs font-semibold text-primary underline underline-offset-4">Open journal</Link>;
    return <span className="text-xs text-muted-foreground">No action required.</span>;
  }

  if (loading) {
    return <PortalPage title="Accounting Bridge Reconciliation" subtitle="Guided accounting remediation across bridge readiness, posting, settlement, and reconciliation."><LoadingBlock label="Loading bridge reconciliation cockpit..." /></PortalPage>;
  }

  return (
    <PortalPage title="Accounting Bridge Reconciliation" subtitle="Resolve mapping blockers, review ready-unposted bridge items, and verify reconciliation evidence without auto-posting journals." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Bridge Reconciliation" }]} actions={[{ href: ROUTES.admin.accountingPeriods, label: "Year-End Close", variant: "secondary" }, { href: ROUTES.admin.accountingBridges, label: "Bridge Readiness", variant: "secondary" }, { href: ROUTES.admin.accountingSetup, label: "Accounting Setup", variant: "secondary" }]} statusBadge={{ label: "Guided Remediation", tone: "info" }}>
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load bridge reconciliation" description={error} onRetry={() => void load(filters)} /> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting operations path</div><h2 className="mt-1 text-xl font-semibold text-foreground">Fix mapping → preview/post bridge → verify reconciliation → close year</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Read-only readiness stays read-only. Create/map actions only repair setup metadata; they do not create JournalEntry, allocate document numbers, or post bridge rows.</p></div><ActionButton variant="secondary" onClick={() => void load(filters, { silent: true })} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</ActionButton></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7"><SummaryCard label="Active FY" value={selectedFinancialYear?.code ?? "Missing"} tone="border-slate-200 bg-slate-50 text-slate-900" /><SummaryCard label="Selected period" value={selectedPeriod?.code ?? "Missing"} tone="border-slate-200 bg-slate-50 text-slate-900" /><SummaryCard label="Ready unposted" value={Number(summary.unposted_bridge_item_count ?? summary.ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={unpostedHref} /><SummaryCard label="Blocked mapping" value={Number(summary.blocked_bridge_item_count ?? summary.blocked_count ?? 0)} tone="border-amber-200 bg-amber-50 text-amber-950" href={blockedHref} /><SummaryCard label="Posted" value={Number(summary.total_journal_postings ?? summary.posted_count ?? 0)} tone="border-emerald-200 bg-emerald-50 text-emerald-900" /><SummaryCard label="Reconciled" value={Number(summary.reconciled_count ?? 0)} tone="border-emerald-200 bg-white text-emerald-900" /><SummaryCard label="Exceptions" value={Number(summary.reconciliation_exception_count ?? summary.exception_count ?? 0)} tone="border-red-200 bg-red-50 text-red-900" /></div><div className="mt-4 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">{readinessBlockers.length ? readinessBlockers.join(" ") : "No selected-context blocker reported."}</div></section>

        <WorkspaceSection title="Mapping remediation" description="Supported blockers can create or map the required account from here. StaffAdvance remains non-postable unless a real source model exists."><div className="grid gap-3 md:grid-cols-3">{(remediation?.rows ?? []).map((row) => <div key={row.event_type} className="rounded-2xl border border-border bg-card p-4 text-sm shadow-sm"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-foreground">{row.required_account_name}</div><div className="font-mono text-xs text-muted-foreground">{row.event_type}</div></div><span className={cx("rounded-full border px-2 py-1 text-xs font-semibold", statusClass(row.status))}>{row.status}</span></div><p className="mt-2 text-xs text-muted-foreground">{row.reason}</p><div className="mt-3 flex flex-wrap gap-2">{row.can_auto_create_account ? <button type="button" onClick={() => void handleCreateAccount(row.event_type)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">{row.event_type === "inventory_delivery_out" ? "Create COGS Account" : "Create Wastage Expense Account"}</button> : null}{row.can_map_account ? <button type="button" onClick={() => void handleApplyMapping(row.event_type, row.existing_account_id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">{row.event_type === "inventory_delivery_out" ? "Map COGS Account" : "Map Wastage Account"}</button> : null}<Link href={row.action_href || ROUTES.admin.accountingSetup} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground">Open setup</Link>{!row.is_supported ? <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">Unsupported Source</span> : null}</div></div>)}</div></WorkspaceSection>

        <WorkspaceSection title="Filters" description="Filter the operational projection. Empty filters default to active financial year and current/open period where available."><div className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6"><select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.financial_year ?? ""} onChange={(event) => setDraft("financial_year", event.target.value)}><option value="">Active financial year</option>{availableFinancialYears.map((row) => <option key={row.id ?? row.code} value={String(row.id ?? row.code ?? "")}>{row.code} {row.is_active ? "(active)" : ""}</option>)}</select><select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.accounting_period ?? ""} onChange={(event) => setDraft("accounting_period", event.target.value)}><option value="">Current/open period</option>{availablePeriods.map((row) => <option key={row.id ?? row.code} value={String(row.id ?? row.code ?? "")}>{row.code} · {row.status}</option>)}</select><input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Module" value={draftFilters.module ?? ""} onChange={(event) => setDraft("module", event.target.value)} /><input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Event key" value={draftFilters.event_key ?? ""} onChange={(event) => setDraft("event_key", event.target.value)} /><input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Source model" value={draftFilters.source_model ?? ""} onChange={(event) => setDraft("source_model", event.target.value)} /><select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.status ?? ""} onChange={(event) => setDraft("status", event.target.value)}>{STATUS_OPTIONS.map((option) => <option key={option || "all"} value={option}>{option || "All statuses"}</option>)}</select><div className="flex gap-2 xl:col-span-3"><ActionButton variant="primary" onClick={applyFilters}>Apply</ActionButton><ActionButton variant="secondary" onClick={clearFilters}>Clear</ActionButton></div></div></WorkspaceSection>

        <WorkspaceSection title="Blocked / exception rows" description="Actionable blockers, mapping gaps, and reconciliation exceptions."><div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm"><table className="min-w-full divide-y divide-border text-sm"><thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Reason</th><th className="px-4 py-3 font-semibold">Recommended action</th></tr></thead><tbody className="divide-y divide-border">{exceptionRows.length === 0 ? <tr><td className="px-4 py-6 text-sm text-muted-foreground" colSpan={4}>No blocked or exception rows for the current filters.</td></tr> : exceptionRows.map((row) => <tr key={rowKey(row)}><td className="px-4 py-4"><div className="font-semibold text-foreground">{row.label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div></td><td className="px-4 py-4"><span className={cx("rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(row.status))}>{row.status}</span></td><td className="px-4 py-4 text-xs text-red-800">{row.exception_reasons[0] || remediationByEvent.get(row.event_key)?.reason || row.blocker_label || "Review required."}</td><td className="px-4 py-4">{rowAction(row)}</td></tr>)}</tbody></table></div></WorkspaceSection>

        <WorkspaceSection title="Source event drilldown" description="READY_UNPOSTED rows show preview/post/source actions. Post stays disabled unless a controlled safe post endpoint exists and prerequisites are ready."><div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm"><table className="min-w-full divide-y divide-border text-sm"><thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">Source</th><th className="px-4 py-3 font-semibold">Journal</th><th className="px-4 py-3 font-semibold">Settlement</th><th className="px-4 py-3 font-semibold">Reconciliation</th><th className="px-4 py-3 font-semibold">Admin action</th></tr></thead><tbody className="divide-y divide-border">{rows.length === 0 ? <tr><td className="px-4 py-6 text-sm text-muted-foreground" colSpan={6}>No rows for the current filters.</td></tr> : rows.map((row) => <tr key={rowKey(row)} className="align-top"><td className="px-4 py-4"><div className="font-semibold text-foreground">{row.label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div><span className={cx("mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(row.status))}>{row.status}</span></td><td className="px-4 py-4 text-xs text-muted-foreground"><div>{sourceLabel(row)}</div>{row.source_reference ? <div>Ref: {row.source_reference}</div> : null}<div>{row.module}</div></td><td className="px-4 py-4 text-xs">{row.journal_entry?.id ? <Link href={`${ROUTES.admin.accountingJournals}/${row.journal_entry.id}`} className="font-semibold text-primary underline underline-offset-4">{row.journal_entry.entry_no || `Journal #${row.journal_entry.id}`}</Link> : <span className="text-muted-foreground">Not posted</span>}</td><td className="px-4 py-4 text-xs">{row.settlement_linked ? "Linked" : "Not linked"}</td><td className="px-4 py-4 text-xs">{row.reconciliation_linked ? `${row.reconciliation_items.length} item(s)` : "Not linked"}</td><td className="px-4 py-4">{rowAction(row)}</td></tr>)}</tbody></table></div></WorkspaceSection>
      </div>
    </PortalPage>
  );
}
