"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const STATUS_OPTIONS = [
  "",
  "READY_UNPOSTED",
  "BLOCKED_BY_MAPPING",
  "BLOCKED_BY_POSTING_APPROVAL",
  "POSTED",
  "SETTLED",
  "RECONCILED",
  "EXCEPTION",
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusClass(status: string): string {
  const value = status.toUpperCase();
  if (value === "OPEN" || value === "RECONCILED" || value === "SETTLED" || value === "POSTED") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (value === "READY_UNPOSTED") return "border-blue-200 bg-blue-50 text-blue-900";
  if (value === "LOCKED" || value.startsWith("BLOCKED")) return "border-amber-200 bg-amber-50 text-amber-950";
  if (value === "CLOSED" || value === "EXCEPTION") return "border-red-200 bg-red-50 text-red-900";
  return "border-slate-200 bg-slate-50 text-slate-900";
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={cx("rounded-2xl border p-4 shadow-sm", tone)}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function sourceLabel(row: AccountingBridgeReconciliationRow): string {
  const model = row.source_model || row.module || "Source";
  const id = row.source_id ? `#${row.source_id}` : "registry";
  return `${model} ${id}`;
}

export default function AccountingBridgeReconciliationPage() {
  const [payload, setPayload] = useState<AccountingBridgeReconciliationPayload | null>(null);
  const [filters, setFilters] = useState<AccountingBridgeReconciliationFilters>({});
  const [draftFilters, setDraftFilters] = useState<AccountingBridgeReconciliationFilters>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextFilters = filters, { silent = false }: { silent?: boolean } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setPayload(await getAccountingBridgeReconciliation(nextFilters));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bridge reconciliation cockpit.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters]);

  useEffect(() => {
    void load({});
  }, [load]);

  const exceptionRows = useMemo(() => (payload?.results ?? []).filter((row) => row.status === "EXCEPTION" || row.exception_reasons.length > 0), [payload?.results]);
  const rows = payload?.results ?? [];
  const payloadAny = payload as unknown as Record<string, any> | null;
  const selectedFinancialYear = payloadAny?.selected_financial_year ?? payload?.accounting_period_readiness?.active_financial_year ?? payload?.financial_year_readiness?.active_financial_year ?? null;
  const selectedPeriod = payloadAny?.selected_accounting_period ?? payload?.accounting_period_readiness?.current_period ?? payload?.financial_year_readiness?.current_period ?? null;
  const readinessBlockers = (payloadAny?.readiness_blockers ?? payload?.accounting_period_readiness?.blockers ?? payload?.financial_year_readiness?.blockers ?? []) as string[];
  const yearEndHint = payloadAny?.year_end_readiness_hint as string | undefined;
  const availableFinancialYears = (payloadAny?.available_financial_years ?? []) as Array<{ id?: number; code?: string; name?: string; is_active?: boolean }>;
  const availablePeriods = (payloadAny?.available_accounting_periods ?? []) as Array<{ id?: number; code?: string; name?: string; status?: string }>;
  const summary = payload?.summary ?? { source_count: 0, ready_unposted_count: 0, blocked_count: 0, posted_count: 0, settled_count: 0, reconciled_count: 0, exception_count: 0 };
  const summaryAny = summary as Record<string, number | undefined>;

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

  if (loading) {
    return (
      <PortalPage title="Accounting Bridge Reconciliation" subtitle="Read-only source → mapping → journal → settlement → reconciliation coverage.">
        <LoadingBlock label="Loading bridge reconciliation cockpit..." />
      </PortalPage>
    );
  }

  return (
    <PortalPage
      title="Accounting Bridge Reconciliation"
      subtitle="Read-only cockpit for source, mapping, journal, settlement, and reconciliation coverage across financial year and accounting period controls."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Bridge Reconciliation" }]}
      actions={[{ href: ROUTES.admin.accountingBridges, label: "Bridge Readiness", variant: "secondary" }, { href: ROUTES.admin.accountingSetup, label: "Accounting Setup", variant: "secondary" }]}
      statusBadge={{ label: "Read Only", tone: "info" }}
    >
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load bridge reconciliation" description={error} onRetry={() => void load(filters)} /> : null}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financial-year reconciliation cockpit</div>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Financial year → period → source → journal → reconciliation</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">This page is read-only. It reads readiness, bridge postings, settlement allocations, and reconciliation items. It does not post journals, allocate document numbers, allocate settlements, or create reconciliation exceptions.</p>
            </div>
            <ActionButton variant="secondary" onClick={() => void load(filters, { silent: true })} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</ActionButton>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryCard label="Invoices" value={Number(summaryAny.total_invoices ?? 0)} tone="border-slate-200 bg-slate-50 text-slate-900" />
            <SummaryCard label="Receipts" value={Number(summaryAny.total_receipts ?? 0)} tone="border-slate-200 bg-slate-50 text-slate-900" />
            <SummaryCard label="Journals" value={Number(summaryAny.total_journal_postings ?? summary.posted_count ?? 0)} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
            <SummaryCard label="Unposted bridge" value={Number(summaryAny.unposted_bridge_item_count ?? summary.ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" />
            <SummaryCard label="Unreconciled" value={Number(summaryAny.unreconciled_money_movement_count ?? 0)} tone="border-amber-200 bg-amber-50 text-amber-950" />
            <SummaryCard label="Exceptions" value={Number(summaryAny.reconciliation_exception_count ?? summary.exception_count ?? 0)} tone="border-red-200 bg-red-50 text-red-900" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected FY</div><div className="mt-1 font-semibold text-foreground">{selectedFinancialYear?.code ?? "Not configured"}</div></div>
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected period</div><div className="mt-1 font-semibold text-foreground">{selectedPeriod?.code ?? "Not configured"}</div></div>
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Period status</div><span className={cx("mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(selectedPeriod?.status ?? "BLOCKED"))}>{selectedPeriod?.status ?? "BLOCKED"}</span></div>
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Year-end hint</div><div className="mt-1 text-xs text-muted-foreground">{yearEndHint ?? "Clear unposted bridge items and reconciliation exceptions before year close."}</div></div>
          </div>
          {readinessBlockers.length ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{readinessBlockers[0]}</div> : null}
        </section>
        <WorkspaceSection title="Filters" description="Filter the read-only projection. Empty filters default to active financial year and current/open period where available.">
          <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6">
            <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={(draftFilters as any).financial_year ?? ""} onChange={(event) => setDraft("financial_year" as keyof AccountingBridgeReconciliationFilters, event.target.value)}><option value="">Active financial year</option>{availableFinancialYears.map((row) => <option key={row.id ?? row.code} value={String(row.id ?? row.code ?? "")}>{row.code} {row.is_active ? "(active)" : ""}</option>)}</select>
            <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={(draftFilters as any).accounting_period ?? ""} onChange={(event) => setDraft("accounting_period" as keyof AccountingBridgeReconciliationFilters, event.target.value)}><option value="">Current/open period</option>{availablePeriods.map((row) => <option key={row.id ?? row.code} value={String(row.id ?? row.code ?? "")}>{row.code} · {row.status}</option>)}</select>
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Module" value={draftFilters.module ?? ""} onChange={(event) => setDraft("module", event.target.value)} />
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Event key" value={draftFilters.event_key ?? ""} onChange={(event) => setDraft("event_key", event.target.value)} />
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Source model" value={(draftFilters as any).source_model ?? ""} onChange={(event) => setDraft("source_model" as keyof AccountingBridgeReconciliationFilters, event.target.value)} />
            <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.status ?? ""} onChange={(event) => setDraft("status", event.target.value)}>{STATUS_OPTIONS.map((option) => <option key={option || "all"} value={option}>{option || "All statuses"}</option>)}</select>
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" type="date" value={draftFilters.date_from ?? ""} onChange={(event) => setDraft("date_from", event.target.value)} />
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" type="date" value={draftFilters.date_to ?? ""} onChange={(event) => setDraft("date_to", event.target.value)} />
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Account code/name/id" value={(draftFilters as any).account ?? ""} onChange={(event) => setDraft("account" as keyof AccountingBridgeReconciliationFilters, event.target.value)} />
            <div className="flex gap-2 xl:col-span-3"><ActionButton variant="primary" onClick={applyFilters}>Apply</ActionButton><ActionButton variant="secondary" onClick={clearFilters}>Clear</ActionButton></div>
          </div>
        </WorkspaceSection>
        <WorkspaceSection title="Readiness checklist" description="Read-only blockers for the selected financial year and period."><div className="grid gap-2 rounded-2xl border border-border bg-card p-4 text-sm shadow-sm md:grid-cols-2">{["FY selected", "Period selected", "Bridge postable", "Reconciliation clean"].map((label, index) => { const ok = index === 0 ? Boolean(selectedFinancialYear) : index === 1 ? Boolean(selectedPeriod) : index === 2 ? Number(summaryAny.blocked_bridge_item_count ?? summary.blocked_count ?? 0) === 0 : Number(summaryAny.reconciliation_exception_count ?? summary.exception_count ?? 0) === 0; return <div key={label} className={cx("rounded-xl border px-3 py-2", ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950")}>{ok ? "✓" : "!"} {label}</div>; })}</div></WorkspaceSection>
        <WorkspaceSection title="Exception table" description="Rows with mapping blockers or reconciliation exceptions. No repair or posting action is available here."><div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm"><table className="min-w-full divide-y divide-border text-sm"><thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">Source</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Reason</th><th className="px-4 py-3 font-semibold">Operator action</th></tr></thead><tbody className="divide-y divide-border">{exceptionRows.length === 0 ? (<tr><td className="px-4 py-6 text-sm text-muted-foreground" colSpan={5}>No exception rows for the current filters.</td></tr>) : exceptionRows.map((row) => (<tr key={`${row.row_type}-${row.event_key}-${row.source_model ?? "registry"}-${row.source_id ?? "none"}`}><td className="px-4 py-4"><div className="font-semibold text-foreground">{row.label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div></td><td className="px-4 py-4 text-xs text-muted-foreground">{sourceLabel(row)}</td><td className="px-4 py-4"><span className={cx("rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(row.status))}>{row.status}</span></td><td className="px-4 py-4 text-xs text-red-800">{row.exception_reasons[0] || "Review required."}</td><td className="px-4 py-4 text-xs text-muted-foreground">{row.operator_action}</td></tr>))}</tbody></table></div></WorkspaceSection>
        <WorkspaceSection title="Source event drilldown" description="Read-only source coverage by event. Journal links are shown only for existing posted bridge rows."><div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm"><table className="min-w-full divide-y divide-border text-sm"><thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">Module</th><th className="px-4 py-3 font-semibold">Source</th><th className="px-4 py-3 font-semibold">Mapping</th><th className="px-4 py-3 font-semibold">Journal</th><th className="px-4 py-3 font-semibold">Settlement</th><th className="px-4 py-3 font-semibold">Reconciliation</th></tr></thead><tbody className="divide-y divide-border">{rows.length === 0 ? (<tr><td className="px-4 py-6 text-sm text-muted-foreground" colSpan={7}>No rows for the current filters.</td></tr>) : rows.map((row) => (<tr key={`${row.row_type}-${row.event_key}-${row.source_model ?? "registry"}-${row.source_id ?? "none"}`} className="align-top"><td className="px-4 py-4"><div className="font-semibold text-foreground">{row.label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div><span className={cx("mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(row.status))}>{row.status}</span></td><td className="px-4 py-4 text-xs text-muted-foreground">{row.module}</td><td className="px-4 py-4 text-xs text-muted-foreground"><div>{sourceLabel(row)}</div>{row.source_reference ? <div>Ref: {row.source_reference}</div> : null}</td><td className="px-4 py-4 text-xs"><div>{row.mapping_status || "—"}</div>{row.exception_reasons.length ? <div className="mt-1 text-red-800">{row.exception_reasons[0]}</div> : null}</td><td className="px-4 py-4 text-xs">{row.journal_entry?.id ? (<Link href={`${ROUTES.admin.accountingJournals}/${row.journal_entry.id}`} className="font-semibold text-primary underline underline-offset-4">{row.journal_entry.entry_no || `Journal #${row.journal_entry.id}`}</Link>) : <span className="text-muted-foreground">Not posted</span>}{row.journal_entry?.accounting_period_code ? (<div className="mt-1 text-muted-foreground">FY {row.journal_entry.financial_year_code ?? "—"} · {row.journal_entry.accounting_period_code} · {row.journal_entry.accounting_period_status ?? "—"}</div>) : null}</td><td className="px-4 py-4 text-xs">{row.settlement_linked ? "Linked" : "Not linked"}</td><td className="px-4 py-4 text-xs">{row.reconciliation_linked ? `${row.reconciliation_items.length} item(s)` : "Not linked"}</td></tr>))}</tbody></table></div></WorkspaceSection>
      </div>
    </PortalPage>
  );
}
