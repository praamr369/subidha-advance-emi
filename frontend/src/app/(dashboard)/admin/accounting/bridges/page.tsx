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
  getAccountingBridgeReadiness,
  type AccountingBridgeReadinessAccount,
  type AccountingBridgeReadinessEvent,
  type AccountingBridgeReadinessPayload,
} from "@/services/accounting-bridge-readiness";
import { seedSupportedAccountingMappings } from "@/services/accounting-mapping-remediation";
import { generateCurrentAccountingPeriod } from "@/services/accounting-period-actions";

const MAPPING_AUDIT_HREF = "/admin/accounting/setup/mapping-audit";
const DOCUMENT_NUMBERING_HREF = ROUTES.admin.settingsBusinessSetupDocumentNumbering;
const CANONICAL_STATUSES = ["POSTABLE", "READY_UNPOSTED", "POSTED", "RECONCILED", "BLOCKED_BY_MAPPING", "BLOCKED_BY_PERIOD", "BLOCKED_BY_NUMBERING", "BLOCKED_BY_APPROVAL", "UNSUPPORTED_SOURCE"];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function bridgeGroupName(event: AccountingBridgeReadinessEvent): string {
  return event.event_group || event.module || event.source_module || "Other";
}

function statusClass(status: string): string {
  const normalized = status.toUpperCase();
  if (["READY", "POSTABLE", "POSTED", "RECONCILED", "OPEN"].includes(normalized)) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (normalized === "READY_UNPOSTED") return "border-blue-200 bg-blue-50 text-blue-900";
  if (normalized.startsWith("BLOCKED") || normalized === "LOCKED") return "border-amber-200 bg-amber-50 text-amber-950";
  if (normalized === "UNSUPPORTED_SOURCE" || normalized === "CLOSED") return "border-red-200 bg-red-50 text-red-900";
  return "border-slate-200 bg-slate-50 text-slate-900";
}

function accountLabel(account: AccountingBridgeReadinessAccount): string {
  const code = account.code ? `${account.code} · ` : "";
  const name = account.name ?? account.kind ?? "Configured account";
  const type = account.account_type ? ` (${account.account_type})` : "";
  const purpose = account.purpose ? ` · ${account.purpose}` : account.requirement ? ` · ${account.requirement}` : "";
  return `${code}${name}${type}${purpose}`;
}

function AccountList({ accounts, emptyLabel }: { accounts: AccountingBridgeReadinessAccount[]; emptyLabel: string }) {
  if (!accounts.length) return <span className="text-muted-foreground">{emptyLabel}</span>;
  return <ul className="space-y-1">{accounts.map((account, index) => <li key={`${account.id ?? account.name ?? account.kind ?? "account"}-${account.purpose ?? account.requirement ?? index}`}>{accountLabel(account)}</li>)}</ul>;
}

function SummaryCard({ label, value, tone, href }: { label: string; value: number | string; tone: string; href?: string }) {
  const body = <div className={cx("rounded-2xl border p-4 shadow-sm", tone)}><div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
  return href ? <Link href={href}>{body}</Link> : body;
}

function setupHrefForEvent(event: AccountingBridgeReadinessEvent): string {
  if (event.status === "BLOCKED_BY_PERIOD") return ROUTES.admin.accountingPeriods;
  if (event.status === "BLOCKED_BY_NUMBERING") return DOCUMENT_NUMBERING_HREF;
  if (event.status === "UNSUPPORTED_SOURCE") return MAPPING_AUDIT_HREF;
  return event.setup_href || event.action_href || MAPPING_AUDIT_HREF;
}

function eventActionLabel(event: AccountingBridgeReadinessEvent): string {
  if (event.status === "POSTABLE") return "Review controlled posting";
  if (event.status === "READY_UNPOSTED") return "Review unposted bridge items";
  if (event.status === "BLOCKED_BY_MAPPING") return "Fix mapping";
  if (event.status === "BLOCKED_BY_PERIOD") return "Open periods";
  if (event.status === "BLOCKED_BY_NUMBERING") return "Open numbering";
  if (event.status === "BLOCKED_BY_APPROVAL") return "Review approval gate";
  if (event.status === "UNSUPPORTED_SOURCE") return "Unsupported source";
  return "Open action";
}

export default function AccountingBridgeReadinessPage() {
  const [payload, setPayload] = useState<AccountingBridgeReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load({ silent = false }: { silent?: boolean } = {}) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setPayload(await getAccountingBridgeReadiness());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounting bridge readiness.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleSeedMappings() {
    setActionBusy("seed");
    setNotice(null);
    try {
      const result = await seedSupportedAccountingMappings();
      setNotice(`Supported defaults seeded. Journals created: ${result.journal_entries_created}; document numbers allocated: ${result.document_sequences_allocated}.`);
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed supported mappings.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleGeneratePeriod() {
    setActionBusy("period");
    setNotice(null);
    try {
      const result = await generateCurrentAccountingPeriod();
      setNotice(result.detail || "Current accounting period generated or confirmed.");
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate current accounting period.");
    } finally {
      setActionBusy(null);
    }
  }

  const groupedEvents = useMemo(() => {
    const groups = new Map<string, AccountingBridgeReadinessEvent[]>();
    for (const event of payload?.events ?? []) {
      const key = bridgeGroupName(event);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [payload?.events]);

  if (loading) {
    return <PortalPage title="Accounting Bridge Readiness" subtitle="Validating bridge mappings and canonical postability."><LoadingBlock label="Loading accounting bridge readiness..." /></PortalPage>;
  }

  const summary = payload?.summary ?? { ready_count: 0, postable_count: 0, ready_unposted_count: 0, posted_count: 0, reconciled_count: 0, blocked_by_mapping_count: 0, blocked_by_period_count: 0, blocked_by_numbering_count: 0, blocked_by_approval_count: 0, unsupported_source_count: 0 };
  const periodReadiness = payload?.accounting_period_readiness ?? payload?.financial_year_readiness ?? null;
  const hasCurrentPeriodBlocker = (periodReadiness?.blockers ?? []).some((reason) => reason.toLowerCase().includes("period"));

  return (
    <PortalPage
      title="Accounting Bridge Readiness"
      subtitle="Canonical postability cockpit. Read-only validation remains read-only; setup actions create setup metadata only."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Bridge Readiness" }]}
      actions={[{ href: MAPPING_AUDIT_HREF, label: "Mapping Audit", variant: "secondary" }, { href: ROUTES.admin.accountingBridgeReconciliation, label: "Bridge Reconciliation", variant: "secondary" }, { href: DOCUMENT_NUMBERING_HREF, label: "Document Numbering", variant: "secondary" }]}
      statusBadge={{ label: "Canonical Postability", tone: "info" }}
    >
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load bridge readiness" description={error} onRetry={() => void load()} /> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active accounting context</div>
              <h2 className="mt-1 text-xl font-semibold text-foreground">FY {periodReadiness?.active_financial_year?.code ?? "not configured"} · Period {periodReadiness?.current_period?.code ?? "not configured"}</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Every event below uses the same status model as mapping audit, bridge reconciliation, and period readiness. Unsupported sources stay non-postable.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="primary" onClick={() => void handleSeedMappings()} disabled={Boolean(actionBusy)}>{actionBusy === "seed" ? "Seeding..." : "Seed Safe Defaults"}</ActionButton>
              <ActionButton variant="secondary" onClick={() => void handleGeneratePeriod()} disabled={Boolean(actionBusy)}>{actionBusy === "period" ? "Generating..." : "Generate Current Period"}</ActionButton>
              <ActionButton variant="secondary" onClick={() => void load({ silent: true })} disabled={refreshing}>{refreshing ? "Refreshing..." : "Validate All"}</ActionButton>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="POSTABLE" value={summary.postable_count ?? 0} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
            <SummaryCard label="READY_UNPOSTED" value={summary.ready_unposted_count ?? 0} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=READY_UNPOSTED`} />
            <SummaryCard label="POSTED" value={summary.posted_count ?? 0} tone="border-emerald-200 bg-white text-emerald-900" />
            <SummaryCard label="RECONCILED" value={summary.reconciled_count ?? 0} tone="border-emerald-200 bg-white text-emerald-900" />
            <SummaryCard label="UNSUPPORTED" value={summary.unsupported_source_count ?? 0} tone="border-red-200 bg-red-50 text-red-900" href={`${MAPPING_AUDIT_HREF}?status=UNSUPPORTED_SOURCE`} />
            <SummaryCard label="MAPPING" value={summary.blocked_by_mapping_count ?? 0} tone="border-amber-200 bg-amber-50 text-amber-950" href={MAPPING_AUDIT_HREF} />
            <SummaryCard label="PERIOD" value={summary.blocked_by_period_count ?? 0} tone="border-amber-200 bg-amber-50 text-amber-950" href={ROUTES.admin.accountingPeriods} />
            <SummaryCard label="NUMBERING" value={summary.blocked_by_numbering_count ?? 0} tone="border-amber-200 bg-amber-50 text-amber-950" href={DOCUMENT_NUMBERING_HREF} />
            <SummaryCard label="APPROVAL" value={summary.blocked_by_approval_count ?? 0} tone="border-amber-200 bg-amber-50 text-amber-950" href={ROUTES.admin.accountingBridges} />
            <SummaryCard label="TOTAL" value={summary.source_count ?? payload?.events.length ?? 0} tone="border-slate-200 bg-slate-50 text-slate-900" />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active FY</div><div className="mt-1 font-semibold text-foreground">{periodReadiness?.active_financial_year?.code ?? "Not configured"}</div></div>
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting period</div><div className="mt-1 font-semibold text-foreground">{periodReadiness?.current_period?.code ?? "Not configured"}</div></div>
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Period status</div><span className={cx("mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(periodReadiness?.current_period?.status ?? "BLOCKED_BY_PERIOD"))}>{periodReadiness?.current_period?.status ?? "BLOCKED_BY_PERIOD"}</span></div>
          </div>
          {periodReadiness?.blockers?.length ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{periodReadiness.blockers[0]}</div> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={MAPPING_AUDIT_HREF} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Mapping Audit</Link>
            <Link href={ROUTES.admin.accountingBridgeReconciliation} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Bridge Reconciliation</Link>
            <Link href={ROUTES.admin.accountingPeriods} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Accounting Periods</Link>
            <Link href={DOCUMENT_NUMBERING_HREF} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Document Numbering</Link>
            <Link href={ROUTES.admin.accountingFinanceAccounts} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Finance Accounts</Link>
            {hasCurrentPeriodBlocker ? <button type="button" onClick={() => void handleGeneratePeriod()} className="rounded-xl border px-3 py-2 text-sm font-semibold">Generate current period</button> : null}
          </div>
        </section>

        {groupedEvents.map(([groupName, events]) => (
          <WorkspaceSection key={`bridge-group-${groupName}`} title={groupName} description="Rows show canonical status, blocker reason, and action target. No posting happens from this page.">
            <div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">Canonical status</th><th className="px-4 py-3 font-semibold">Debit readiness</th><th className="px-4 py-3 font-semibold">Credit readiness</th><th className="px-4 py-3 font-semibold">Finance accounts</th><th className="px-4 py-3 font-semibold">Action</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {events.map((event) => (
                    <tr key={event.event_key} className="align-top">
                      <td className="px-4 py-4"><div className="font-semibold text-foreground">{event.label}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{event.event_key}</div>{event.source_model ? <div className="mt-1 text-xs text-muted-foreground">Source: {event.source_model}</div> : null}</td>
                      <td className="px-4 py-4"><span className={cx("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(event.status))}>{event.status}</span><div className="mt-2 text-xs text-muted-foreground">Preview: {event.can_preview ? "Yes" : "No"}</div><div className="text-xs text-muted-foreground">Post: {event.can_post ? "Yes" : "No"}</div><div className="text-xs text-muted-foreground">Reconcile: {event.can_reconcile ? "Yes" : "No"}</div></td>
                      <td className="px-4 py-4 text-xs"><div className="font-semibold text-foreground">Required</div><div className="mt-1 text-muted-foreground">{(event.debit_requirements ?? []).join(", ") || "Not specified"}</div><div className="mt-3 font-semibold text-foreground">Configured</div><div className="mt-1"><AccountList accounts={event.debit_accounts} emptyLabel="No debit account configured." /></div></td>
                      <td className="px-4 py-4 text-xs"><div className="font-semibold text-foreground">Required</div><div className="mt-1 text-muted-foreground">{(event.credit_requirements ?? []).join(", ") || "Not specified"}</div><div className="mt-3 font-semibold text-foreground">Configured</div><div className="mt-1"><AccountList accounts={event.credit_accounts} emptyLabel="No credit account configured." /></div></td>
                      <td className="px-4 py-4 text-xs"><AccountList accounts={event.finance_accounts} emptyLabel="No finance account required or configured." /><div className="mt-3 text-muted-foreground">{event.blocker_reason || event.blocking_reasons?.[0] || "No blocking reason."}</div></td>
                      <td className="px-4 py-4 text-xs text-muted-foreground"><div className="font-semibold text-foreground">{event.recommended_action || event.operator_action}</div><Link href={setupHrefForEvent(event)} className="mt-2 inline-flex rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground">{eventActionLabel(event)}</Link>{event.event_key === "staff_advance" ? <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">Unsupported source model; no Post button is available.</div> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </WorkspaceSection>
        ))}
      </div>
    </PortalPage>
  );
}
