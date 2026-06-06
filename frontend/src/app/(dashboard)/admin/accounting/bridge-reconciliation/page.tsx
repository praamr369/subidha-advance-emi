"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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

const STATUS_OPTIONS = ["", "READY_UNPOSTED", "BLOCKED_BY_MAPPING", "BLOCKED_BY_POSTING_APPROVAL", "POSTED", "SETTLED", "RECONCILED", "EXCEPTION"];

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

function SummaryCard({ label, value, tone, href }: { label: string; value: number; tone: string; href?: string }) {
  const body = (
    <div className={cx("rounded-2xl border p-4 shadow-sm", tone)}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
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

function rowAction(row: AccountingBridgeReconciliationRow) {
  if (row.blocker_code === "UNSUPPORTED_STAFF_ADVANCE") {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        Unsupported source model. StaffAdvance remains non-postable until a real workflow exists.
      </div>
    );
  }
  if (row.status === "READY_UNPOSTED") {
    return (
      <div className="flex flex-col gap-2 text-xs">
        <Link href={row.preview_action_href || ROUTES.admin.accountingBridges} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-900">
          Preview posting
        </Link>
        {row.post_action_href ? (
          <Link href={row.post_action_href} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-900">
            Post bridge item
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">Post unavailable: no safe row-level endpoint.</span>
        )}
        {row.source_action_href ? <Link href={row.source_action_href} className="underline underline-offset-4">Open source</Link> : null}
      </div>
    );
  }
  if (row.status.startsWith("BLOCKED")) {
    return row.action_href ? (
      <div className="flex flex-col gap-2 text-xs">
        <Link href={row.action_href} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-950">
          Fix mapping / Open setup
        </Link>
        <span className="text-muted-foreground">{row.recommended_action || row.operator_action}</span>
      </div>
    ) : (
      <span className="text-xs text-muted-foreground">{row.recommended_action || row.operator_action || "Review setup."}</span>
    );
  }
  if (row.journal_entry?.id) {
    return <Link href={`${ROUTES.admin.accountingJournals}/${row.journal_entry.id}`} className="text-xs font-semibold text-primary underline underline-offset-4">Open journal</Link>;
  }
  return <span className="text-xs text-muted-foreground">No action required.</span>;
}

export default function AccountingBridgeReconciliationPage() {
  const searchParams = useSearchParams();
  const queryFilters = useMemo<AccountingBridgeReconciliationFilters>(() => ({
    financial_year: searchParams.get("financial_year") || undefined,
    accounting_period: searchParams.get("accounting_period") || undefined,
    status: searchParams.get("status") || undefined,
    event_key: searchParams.get("event_key") || undefined,
    module: searchParams.get("module") || undefined,
    source_model: searchParams.get("source_model") || undefined,
  }), [searchParams]);

  const [payload, setPayload] = useState<AccountingBridgeReconciliationPayload | null>(null);
  const [filters, setFilters] = useState<AccountingBridgeReconciliationFilters>(queryFilters);
  const [draftFilters, setDraftFilters] = useState<AccountingBridgeReconciliationFilters>(queryFilters);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(nextFilters = filters, opts: { silent?: boolean } = {}) {
    if (opts.silent) setRefreshing(true);
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
  }

  useEffect(() => {
    setFilters(queryFilters);
    setDraftFilters(queryFilters);
    void load(queryFilters);
  }, [queryFilters]);

  const rows = payload?.results ?? [];
  const exceptionRows = rows.filter((row) => row.status === "EXCEPTION" || row.exception_reasons.length > 0 || row.status.startsWith("BLOCKED"));
  const readyRows = rows.filter((row) => row.status === "READY_UNPOSTED");
  const blockedRows = rows.filter((row) => row.status.startsWith("BLOCKED"));
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

  if (loading) {
    return (
      <PortalPage title="Accounting Bridge Reconciliation" subtitle="Guided accounting remediation across bridge readiness, posting, settlement, and reconciliation.">
        <LoadingBlock label="Loading bridge reconciliation cockpit..." />
      </PortalPage>
    );
  }

  return (
    <PortalPage
      title="Accounting Bridge Reconciliation"
      subtitle="Guided operations cockpit for blocked mappings, ready-unposted bridge items, posted journals, settlement links, and reconciliation evidence."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Bridge Reconciliation" }]}
      actions={[{ href: ROUTES.admin.accountingPeriods, label: "Year-End Close", variant: "secondary" }, { href: ROUTES.admin.accountingBridges, label: "Bridge Readiness", variant: "secondary" }, { href: ROUTES.admin.accountingSetup, label: "Accounting Setup", variant: "secondary" }]}
      statusBadge={{ label: "Guided Remediation", tone: "info" }}
    >
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load bridge reconciliation" description={error} onRetry={() => void load(filters)} /> : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting operations path</div>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Resolve mapping → preview/post bridge → verify reconciliation → close year</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Read-only readiness remains read-only. Posting is only available through existing controlled bridge run pages; unsupported sources are not postable.</p>
            </div>
            <ActionButton variant="secondary" onClick={() => void load(filters, { silent: true })} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</ActionButton>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <SummaryCard label="Active FY" value={selectedFinancialYear?.code ? 1 : 0} tone="border-slate-200 bg-slate-50 text-slate-900" />
            <SummaryCard label="Ready unposted" value={Number(summary.unposted_bridge_item_count ?? summary.ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={unpostedHref} />
            <SummaryCard label="Blocked mapping" value={Number(summary.blocked_bridge_item_count ?? summary.blocked_count ?? 0)} tone="border-amber-200 bg-amber-50 text-amber-950" href={blockedHref} />
            <SummaryCard label="Posted" value={Number(summary.total_journal_postings ?? summary.posted_count ?? 0)} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
            <SummaryCard label="Reconciled" value={Number(summary.reconciled_count ?? 0)} tone="border-emerald-200 bg-white text-emerald-900" />
            <SummaryCard label="Unreconciled" value={Number(summary.unreconciled_money_movement_count ?? 0)} tone="border-amber-200 bg-white text-amber-950" />
            <SummaryCard label="Exceptions" value={Number(summary.reconciliation_exception_count ?? summary.exception_count ?? 0)} tone="border-red-200 bg-red-50 text-red-900" />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected FY</div><div className="mt-1 font-semibold text-foreground">{selectedFinancialYear?.code ?? "Not configured"}</div></div>
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected period</div><div className="mt-1 font-semibold text-foreground">{selectedPeriod?.code ?? "Not configured"}</div></div>
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Period status</div><span className={cx("mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(selectedPeriod?.status ?? "BLOCKED"))}>{selectedPeriod?.status ?? "BLOCKED"}</span></div>
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Year-end blockers</div><div className="mt-1 text-xs text-muted-foreground">{readinessBlockers.length ? readinessBlockers[0] : "No selected-context blocker reported."}</div></div>
          </div>
        </section>

        <WorkspaceSection title="Remediation actions" description="Direct next steps. No action here posts or mutates accounting records.">
          <div className="grid gap-3 md:grid-cols-3">
            <Link href={blockedHref} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm"><div className="font-semibold">1. Fix blocked mappings</div><div className="mt-1 text-xs">{blockedRows.length} blocked row(s). StaffAdvance remains unsupported and non-postable.</div></Link>
            <Link href={unpostedHref} className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 shadow-sm"><div className="font-semibold">2. Review unposted bridge items</div><div className="mt-1 text-xs">{readyRows.length} row(s) need controlled preview/post workflow.</div></Link>
            <Link href={ROUTES.admin.accountingPeriods} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900 shadow-sm"><div className="font-semibold">3. Return to year-end close</div><div className="mt-1 text-xs">Close remains blocked until open periods and unposted bridge items are resolved.</div></Link>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Filters" description="Filter the operational projection. Empty filters default to active financial year and current/open period where available.">
          <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6">
            <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.financial_year ?? ""} onChange={(event) => setDraft("financial_year", event.target.value)}><option value="">Active financial year</option>{availableFinancialYears.map((row) => <option key={row.id ?? row.code} value={String(row.id ?? row.code ?? "")}>{row.code} {row.is_active ? "(active)" : ""}</option>)}</select>
            <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.accounting_period ?? ""} onChange={(event) => setDraft("accounting_period", event.target.value)}><option value="">Current/open period</option>{availablePeriods.map((row) => <option key={row.id ?? row.code} value={String(row.id ?? row.code ?? "")}>{row.code} · {row.status}</option>)}</select>
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Module" value={draftFilters.module ?? ""} onChange={(event) => setDraft("module", event.target.value)} />
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Event key" value={draftFilters.event_key ?? ""} onChange={(event) => setDraft("event_key", event.target.value)} />
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Source model" value={draftFilters.source_model ?? ""} onChange={(event) => setDraft("source_model", event.target.value)} />
            <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.status ?? ""} onChange={(event) => setDraft("status", event.target.value)}>{STATUS_OPTIONS.map((option) => <option key={option || "all"} value={option}>{option || "All statuses"}</option>)}</select>
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" type="date" value={draftFilters.date_from ?? ""} onChange={(event) => setDraft("date_from", event.target.value)} />
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" type="date" value={draftFilters.date_to ?? ""} onChange={(event) => setDraft("date_to", event.target.value)} />
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Account code/name/id" value={draftFilters.account ?? ""} onChange={(event) => setDraft("account", event.target.value)} />
            <div className="flex gap-2 xl:col-span-3"><ActionButton variant="primary" onClick={applyFilters}>Apply</ActionButton><ActionButton variant="secondary" onClick={clearFilters}>Clear</ActionButton></div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Blocked / exception rows" description="Actionable blockers, mapping gaps, and reconciliation exceptions.">
          <div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Reason</th><th className="px-4 py-3 font-semibold">Recommended action</th></tr></thead>
              <tbody className="divide-y divide-border">
                {exceptionRows.length === 0 ? <tr><td className="px-4 py-6 text-sm text-muted-foreground" colSpan={4}>No blocked or exception rows for the current filters.</td></tr> : exceptionRows.map((row) => (
                  <tr key={rowKey(row)}>
                    <td className="px-4 py-4"><div className="font-semibold text-foreground">{row.label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div></td>
                    <td className="px-4 py-4"><span className={cx("rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(row.status))}>{row.status}</span></td>
                    <td className="px-4 py-4 text-xs text-red-800">{row.exception_reasons[0] || row.blocker_label || "Review required."}</td>
                    <td className="px-4 py-4">{rowAction(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Source event drilldown" description="Operational source coverage. Posting buttons appear only if a real safe endpoint exists for that source.">
          <div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">Source</th><th className="px-4 py-3 font-semibold">Journal</th><th className="px-4 py-3 font-semibold">Settlement</th><th className="px-4 py-3 font-semibold">Reconciliation</th><th className="px-4 py-3 font-semibold">Admin action</th></tr></thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 ? <tr><td className="px-4 py-6 text-sm text-muted-foreground" colSpan={6}>No rows for the current filters.</td></tr> : rows.map((row) => (
                  <tr key={rowKey(row)} className="align-top">
                    <td className="px-4 py-4"><div className="font-semibold text-foreground">{row.label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div><span className={cx("mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(row.status))}>{row.status}</span></td>
                    <td className="px-4 py-4 text-xs text-muted-foreground"><div>{sourceLabel(row)}</div>{row.source_reference ? <div>Ref: {row.source_reference}</div> : null}<div>{row.module}</div></td>
                    <td className="px-4 py-4 text-xs">{row.journal_entry?.id ? <Link href={`${ROUTES.admin.accountingJournals}/${row.journal_entry.id}`} className="font-semibold text-primary underline underline-offset-4">{row.journal_entry.entry_no || `Journal #${row.journal_entry.id}`}</Link> : <span className="text-muted-foreground">Not posted</span>}{row.journal_entry?.accounting_period_code ? <div className="mt-1 text-muted-foreground">FY {row.journal_entry.financial_year_code ?? "—"} · {row.journal_entry.accounting_period_code} · {row.journal_entry.accounting_period_status ?? "—"}</div> : null}</td>
                    <td className="px-4 py-4 text-xs">{row.settlement_linked ? "Linked" : "Not linked"}</td>
                    <td className="px-4 py-4 text-xs">{row.reconciliation_linked ? `${row.reconciliation_items.length} item(s)` : "Not linked"}</td>
                    <td className="px-4 py-4">{rowAction(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspaceSection>
      </div>
    </PortalPage>
  );
}
