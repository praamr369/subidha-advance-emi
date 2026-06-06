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

const MAPPING_AUDIT_HREF = "/admin/accounting/setup/mapping-audit";
const DOCUMENT_NUMBERING_HREF = ROUTES.admin.settingsBusinessSetupDocumentNumbering;

const FILTERS = ["All", "Blocked", "Unsupported", "Postable", "Reconciled", "Ready", "Skipped", "Warnings"] as const;
type BridgeFilter = (typeof FILTERS)[number];

const GROUP_ORDER = [
  "Collections",
  "Customer Credit",
  "Direct Sale",
  "EMI / Subscription",
  "Rent & Lease",
  "Payments / Refunds",
  "Purchase & Vendor",
  "Inventory",
  "Manufacturing",
  "Commission / Payout",
  "HR & Payroll",
  "Returns / Corrections",
  "Unsupported / Fallback",
  "Other",
];

const FIX_FIRST_ORDER = [
  "Unsupported source blockers",
  "Missing posting profiles",
  "Missing debit accounts",
  "Missing credit accounts",
  "Missing finance accounts",
  "Reconciliation exceptions",
  "Numbering or period blockers",
  "Warning-only rows",
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function normalizedStatus(event: AccountingBridgeReadinessEvent): string {
  return String(event.status || event.canonical_status || "UNKNOWN").toUpperCase();
}

function statusClass(status: string): string {
  const normalized = status.toUpperCase();
  if (["READY", "POSTABLE", "POSTED", "RECONCILED", "OPEN"].includes(normalized)) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (normalized === "READY_UNPOSTED") return "border-blue-200 bg-blue-50 text-blue-900";
  if (normalized.includes("WARNING") || normalized === "SKIPPED") return "border-amber-200 bg-amber-50 text-amber-950";
  if (normalized.startsWith("BLOCKED") || normalized === "LOCKED") return "border-red-200 bg-red-50 text-red-900";
  if (normalized === "UNSUPPORTED_SOURCE" || normalized.includes("UNSUPPORTED")) return "border-red-200 bg-red-50 text-red-900";
  return "border-slate-200 bg-slate-50 text-slate-900";
}

function groupName(event: AccountingBridgeReadinessEvent): string {
  const text = `${event.event_group ?? ""} ${event.module ?? ""} ${event.source_module ?? ""} ${event.event_key ?? ""}`.toLowerCase();
  if (text.includes("advance") || text.includes("customer credit")) return "Customer Credit";
  if (text.includes("direct") || text.includes("sale") || text.includes("billing")) return "Direct Sale";
  if (text.includes("emi") || text.includes("subscription") || text.includes("cancellation")) return "EMI / Subscription";
  if (text.includes("rent") || text.includes("lease") || text.includes("deposit") || text.includes("damage")) return "Rent & Lease";
  if (text.includes("refund") || text.includes("payment") || text.includes("receipt") || text.includes("settlement") || text.includes("bank")) return "Payments / Refunds";
  if (text.includes("purchase") || text.includes("vendor")) return "Purchase & Vendor";
  if (text.includes("inventory") || text.includes("stock")) return "Inventory";
  if (text.includes("manufacturing") || text.includes("production")) return "Manufacturing";
  if (text.includes("commission") || text.includes("payout")) return "Commission / Payout";
  if (text.includes("staff") || text.includes("payroll") || text.includes("hr")) return "HR & Payroll";
  if (text.includes("return") || text.includes("correction") || text.includes("reversal") || text.includes("void")) return "Returns / Corrections";
  if (text.includes("unsupported") || event.supported === false || normalizedStatus(event).includes("UNSUPPORTED")) return "Unsupported / Fallback";
  if (text.includes("collection") || text.includes("cashier")) return "Collections";
  return event.event_group || event.module || event.source_module || "Other";
}

function accountLabel(account: AccountingBridgeReadinessAccount): string {
  const code = account.code ? `${account.code} · ` : "";
  const name = account.name ?? account.kind ?? "Configured account";
  const type = account.account_type ? ` (${account.account_type})` : "";
  const purpose = account.purpose ? ` · ${account.purpose}` : account.requirement ? ` · ${account.requirement}` : "";
  return `${code}${name}${type}${purpose}`;
}

function accountText(accounts: AccountingBridgeReadinessAccount[], fallback: string): string {
  return accounts.length ? accounts.map(accountLabel).join(", ") : fallback;
}

function missingFields(event: AccountingBridgeReadinessEvent): string[] {
  const fields = new Set<string>(event.missing_fields ?? []);
  if ((event.debit_requirements?.length ?? 0) > 0 && event.debit_accounts.length === 0) fields.add("Missing debit account");
  if ((event.credit_requirements?.length ?? 0) > 0 && event.credit_accounts.length === 0) fields.add("Missing credit account");
  if (event.finance_account_ready === false || normalizedStatus(event) === "BLOCKED_BY_MAPPING") {
    if (event.finance_accounts.length === 0) fields.add("Missing finance account");
  }
  if (event.posting_profile_ready === false) fields.add("Missing posting profile");
  if (event.accounting_period_ready === false || normalizedStatus(event) === "BLOCKED_BY_PERIOD") fields.add("Accounting period not ready");
  if (event.journal_numbering_ready === false || normalizedStatus(event) === "BLOCKED_BY_NUMBERING") fields.add("Document numbering not ready");
  return Array.from(fields);
}

function routeForEvent(event: AccountingBridgeReadinessEvent): string {
  if (event.safe_next_action_route) return event.safe_next_action_route;
  if (event.remediation_route) return event.remediation_route;
  const status = normalizedStatus(event);
  const fields = missingFields(event).join(" ").toLowerCase();
  if (status === "BLOCKED_BY_PERIOD" || fields.includes("period")) return ROUTES.admin.accountingPeriods;
  if (status === "BLOCKED_BY_NUMBERING" || fields.includes("numbering")) return DOCUMENT_NUMBERING_HREF;
  if (fields.includes("finance account")) return ROUTES.admin.accountingFinanceAccounts;
  if (status.includes("UNSUPPORTED")) return MAPPING_AUDIT_HREF;
  return event.setup_href || event.action_href || MAPPING_AUDIT_HREF;
}

function actionLabel(event: AccountingBridgeReadinessEvent): string {
  if (event.safe_next_action_label) return event.safe_next_action_label;
  if (event.remediation_label) return event.remediation_label;
  const status = normalizedStatus(event);
  if (status === "POSTABLE" || status === "READY_UNPOSTED") return "Open bridge reconciliation";
  if (status === "RECONCILED") return "Review evidence";
  if (status === "BLOCKED_BY_PERIOD") return "Open periods";
  if (status === "BLOCKED_BY_NUMBERING") return "Open numbering";
  if (missingFields(event).some((field) => field.toLowerCase().includes("finance"))) return "Open finance accounts";
  if (status.includes("UNSUPPORTED")) return "Review unsupported source";
  if (status.startsWith("BLOCKED")) return "Open mapping audit";
  return "Open setup";
}

function rowExplanation(event: AccountingBridgeReadinessEvent): string {
  return event.explanation || event.blocker_reason || event.blocking_reasons?.[0] || event.recommended_action || event.operator_action || "No blocker reported by backend.";
}

function rowMatchesFilter(event: AccountingBridgeReadinessEvent, filter: BridgeFilter): boolean {
  const status = normalizedStatus(event);
  const blocker = Boolean(event.is_posting_blocker ?? event.is_close_blocker ?? status.startsWith("BLOCKED"));
  if (filter === "All") return true;
  if (filter === "Blocked") return blocker && !status.includes("UNSUPPORTED");
  if (filter === "Unsupported") return status.includes("UNSUPPORTED") || event.supported === false;
  if (filter === "Postable") return status === "POSTABLE" || status === "READY_UNPOSTED" || event.can_post;
  if (filter === "Reconciled") return status === "RECONCILED";
  if (filter === "Ready") return status === "READY";
  if (filter === "Skipped") return status === "SKIPPED";
  if (filter === "Warnings") return status.includes("WARNING") || Boolean(event.warning_count);
  return true;
}

function rowMatchesSearch(event: AccountingBridgeReadinessEvent, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    event.label,
    event.event_label,
    event.event_key,
    event.source_event_key,
    event.source_module,
    event.module,
    event.event_group,
    event.source_model,
    event.status,
    event.canonical_status,
    ...(event.required_profile_keys ?? []),
    ...(event.missing_profile_keys ?? []),
    ...event.debit_accounts.map(accountLabel),
    ...event.credit_accounts.map(accountLabel),
    ...event.finance_accounts.map(accountLabel),
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(needle);
}

function classifyFix(event: AccountingBridgeReadinessEvent): string | null {
  const status = normalizedStatus(event);
  const fields = missingFields(event).join(" ").toLowerCase();
  if (status.includes("UNSUPPORTED") || event.supported === false) return "Unsupported source blockers";
  if ((event.missing_profile_keys?.length ?? 0) > 0 || event.posting_profile_ready === false) return "Missing posting profiles";
  if (fields.includes("debit")) return "Missing debit accounts";
  if (fields.includes("credit")) return "Missing credit accounts";
  if (fields.includes("finance")) return "Missing finance accounts";
  if (event.reconciliation_ready === false || status.includes("RECONCILIATION")) return "Reconciliation exceptions";
  if (fields.includes("period") || fields.includes("numbering") || status === "BLOCKED_BY_PERIOD" || status === "BLOCKED_BY_NUMBERING") return "Numbering or period blockers";
  if (status.includes("WARNING")) return "Warning-only rows";
  return null;
}

function groupStats(events: AccountingBridgeReadinessEvent[]) {
  return {
    total: events.length,
    ready: events.filter((event) => normalizedStatus(event) === "READY").length,
    postable: events.filter((event) => normalizedStatus(event) === "POSTABLE" || normalizedStatus(event) === "READY_UNPOSTED" || event.can_post).length,
    reconciled: events.filter((event) => normalizedStatus(event) === "RECONCILED").length,
    blocked: events.filter((event) => normalizedStatus(event).startsWith("BLOCKED")).length,
    unsupported: events.filter((event) => normalizedStatus(event).includes("UNSUPPORTED") || event.supported === false).length,
    skipped: events.filter((event) => normalizedStatus(event) === "SKIPPED").length,
    warning: events.filter((event) => normalizedStatus(event).includes("WARNING") || Boolean(event.warning_count)).length,
  };
}

function SummaryCard({ label, value, tone, href }: { label: string; value: number | string; tone: string; href?: string }) {
  const body = <div className={cx("rounded-xl border p-4 shadow-sm", tone)}><div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
  return href ? <Link href={href}>{body}</Link> : body;
}

function BridgeRow({ event }: { event: AccountingBridgeReadinessEvent }) {
  const status = normalizedStatus(event);
  const fields = missingFields(event);
  const profileKeys = event.required_profile_keys ?? event.debit_requirements ?? event.credit_requirements ?? [];
  const missingProfiles = event.missing_profile_keys ?? [];

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{event.label || event.event_label || event.event_key}</h3>
            <span className={cx("rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusClass(status))}>{status}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{event.source_module || event.module || "Accounting"} · <span className="font-mono">{event.source_event_key || event.event_key}</span></div>
        </div>
        <Link href={routeForEvent(event)} className="inline-flex rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">{actionLabel(event)}</Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Debit readiness</div><p className="mt-1 text-muted-foreground">{accountText(event.debit_accounts, fields.some((field) => field.includes("debit")) ? "Missing debit account" : "No debit account required")}</p></div>
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Credit readiness</div><p className="mt-1 text-muted-foreground">{accountText(event.credit_accounts, fields.some((field) => field.includes("credit")) ? "Missing credit account" : "No credit account required")}</p></div>
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Finance-account readiness</div><p className="mt-1 text-muted-foreground">{accountText(event.finance_accounts, fields.some((field) => field.includes("finance")) ? "Missing finance account" : "No finance account required")}</p></div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Required profile keys</div><p className="mt-1 text-muted-foreground">{profileKeys.length ? profileKeys.join(", ") : "Not specified by backend"}</p></div>
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Missing fields</div><p className="mt-1 text-muted-foreground">{[...missingProfiles, ...fields].length ? [...missingProfiles, ...fields].join(", ") : "None reported"}</p></div>
      </div>

      {(status.startsWith("BLOCKED") || status.includes("UNSUPPORTED") || status.includes("WARNING")) ? (
        <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <summary className="cursor-pointer font-semibold">Why blocked?</summary>
          <p className="mt-2 leading-6">{rowExplanation(event)}</p>
          <p className="mt-2 text-xs">Blocks posting: {String(Boolean(event.is_posting_blocker ?? status.startsWith("BLOCKED")))} · Blocks close: {String(Boolean(event.is_close_blocker ?? (status.startsWith("BLOCKED") || status.includes("UNSUPPORTED"))))}</p>
        </details>
      ) : null}
    </article>
  );
}

export default function AccountingBridgeReadinessPage() {
  const [payload, setPayload] = useState<AccountingBridgeReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<BridgeFilter>("All");
  const [search, setSearch] = useState("");
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

  const allEvents = useMemo(() => payload?.events ?? [], [payload?.events]);
  const visibleEvents = useMemo(() => allEvents.filter((event) => rowMatchesFilter(event, filter) && rowMatchesSearch(event, search)), [allEvents, filter, search]);
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, AccountingBridgeReadinessEvent[]>();
    for (const event of visibleEvents) {
      const key = groupName(event);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [visibleEvents]);
  const fixFirst = useMemo(() => {
    const buckets = new Map<string, AccountingBridgeReadinessEvent[]>();
    for (const event of allEvents) {
      const bucket = classifyFix(event);
      if (bucket) buckets.set(bucket, [...(buckets.get(bucket) ?? []), event]);
    }
    return FIX_FIRST_ORDER.map((label) => ({ label, rows: buckets.get(label) ?? [] })).filter((item) => item.rows.length > 0);
  }, [allEvents]);

  if (loading) {
    return <PortalPage title="Accounting Bridge Readiness" subtitle="Validating bridge mappings and canonical postability."><LoadingBlock label="Loading accounting bridge readiness..." /></PortalPage>;
  }

  const summary: Partial<AccountingBridgeReadinessPayload["summary"]> = payload?.summary ?? {
    ready_count: 0,
    postable_count: 0,
    reconciled_count: 0,
    blocked_count: 0,
    unsupported_source_count: 0,
    skipped_count: 0,
    source_count: allEvents.length,
  };
  const periodReadiness = payload?.accounting_period_readiness ?? payload?.financial_year_readiness ?? null;
  const totalRows = summary.source_count ?? allEvents.length;
  const activeSourceCount = allEvents.filter((event) => event.source_workflow_exists !== false && event.supported !== false).length;
  const unsupportedCount = summary.unsupported_source_count ?? allEvents.filter((event) => normalizedStatus(event).includes("UNSUPPORTED")).length;
  const skippedCount = summary.skipped_count ?? allEvents.filter((event) => normalizedStatus(event) === "SKIPPED").length;
  const bridgeStatus = unsupportedCount || summary.blocked_count ? "Blocked" : summary.postable_count || summary.ready_count ? "Ready" : "Needs review";

  return (
    <PortalPage
      title="Accounting Bridge Readiness"
      subtitle="Operator-first control center for what is postable, what is blocked, and where setup should be fixed. This page is read-only."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Bridge Readiness" }]}
      actions={[{ href: MAPPING_AUDIT_HREF, label: "Mapping Audit", variant: "secondary" }, { href: ROUTES.admin.accountingBridgeReconciliation, label: "Bridge Reconciliation", variant: "secondary" }, { href: ROUTES.admin.accountingSetup, label: "Accounting Setup", variant: "secondary" }]}
      statusBadge={{ label: bridgeStatus, tone: bridgeStatus === "Ready" ? "success" : "warning" }}
    >
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load bridge readiness" description={error} onRetry={() => void load()} /> : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting Bridge Readiness</div>
              <h2 className="mt-1 text-xl font-semibold text-foreground">FY {periodReadiness?.active_financial_year?.code ?? "not configured"} · {bridgeStatus}</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Readiness checks do not post journals, complete reconciliation, create mappings, or mutate source records.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={MAPPING_AUDIT_HREF} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Mapping Audit</Link>
              <Link href={ROUTES.admin.accountingBridgeReconciliation} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Bridge Reconciliation</Link>
              <Link href={ROUTES.admin.accountingSetup} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Accounting Setup</Link>
              <Link href={DOCUMENT_NUMBERING_HREF} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Document Numbering</Link>
              <Link href={ROUTES.admin.accountingFinanceAccounts} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Finance Accounts</Link>
              <ActionButton variant="secondary" onClick={() => void load({ silent: true })} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</ActionButton>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Active sources" value={activeSourceCount} tone="border-slate-200 bg-slate-50 text-slate-900" />
            <SummaryCard label="Total profiles" value={summary.source_count ?? totalRows} tone="border-slate-200 bg-slate-50 text-slate-900" />
            <SummaryCard label="Ready" value={summary.ready_count ?? 0} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
            <SummaryCard label="Postable" value={summary.postable_count ?? 0} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
            <SummaryCard label="Reconciled" value={summary.reconciled_count ?? 0} tone="border-emerald-200 bg-white text-emerald-900" />
            <SummaryCard label="Unsupported" value={unsupportedCount} tone="border-red-200 bg-red-50 text-red-900" />
            <SummaryCard label="Skipped" value={skippedCount} tone="border-slate-200 bg-slate-50 text-slate-900" />
            <SummaryCard label="Total rows" value={totalRows} tone="border-slate-200 bg-slate-50 text-slate-900" />
            <SummaryCard label="Current status" value={bridgeStatus} tone={bridgeStatus === "Ready" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"} />
          </div>
        </section>

        <WorkspaceSection title="Fix first" description="Ranked by close/posting severity. Open the target setup screen; no fix is applied from this readiness page.">
          {fixFirst.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{fixFirst.map((item) => <Link key={item.label} href={routeForEvent(item.rows[0])} className="rounded-xl border border-border bg-card p-4 shadow-sm hover:bg-muted/40"><div className="text-sm font-semibold text-foreground">{item.label}</div><div className="mt-2 text-2xl font-semibold">{item.rows.length}</div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.rows[0].label || item.rows[0].event_key}: {rowExplanation(item.rows[0])}</p></Link>)}</div> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">No blocker buckets found in the current readiness payload.</div>}
        </WorkspaceSection>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">{FILTERS.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cx("rounded-full border px-3 py-1.5 text-xs font-semibold", filter === item ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground")}>{item}</button>)}</div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event, source, status, profile key, account" className="min-h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground lg:w-96" />
          </div>
        </section>

        {groupedEvents.map(([name, events]) => {
          const stats = groupStats(events);
          return (
            <WorkspaceSection key={name} title={name} description="Grouped bridge rows show readiness, blockers, explanation, and the safest next route.">
              <div className="mb-3 grid gap-2 sm:grid-cols-4 xl:grid-cols-8">
                {Object.entries(stats).map(([label, value]) => <div key={`${name}-${label}`} className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold capitalize text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold text-foreground">{value}</div></div>)}
              </div>
              <div className="grid gap-3">
                {events.map((event) => <BridgeRow key={event.event_key} event={event} />)}
              </div>
            </WorkspaceSection>
          );
        })}

        <details className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <summary className="cursor-pointer text-base font-semibold text-foreground">Advanced raw readiness</summary>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-background shadow-sm">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Canonical status</th><th className="px-4 py-3">Debit</th><th className="px-4 py-3">Credit</th><th className="px-4 py-3">Finance</th><th className="px-4 py-3">Backend reason</th></tr></thead>
              <tbody className="divide-y divide-border">
                {allEvents.map((event) => <tr key={`raw-${event.event_key}`} className="align-top"><td className="px-4 py-4"><div className="font-semibold">{event.label}</div><div className="font-mono text-xs text-muted-foreground">{event.event_key}</div></td><td className="px-4 py-4"><span className={cx("rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(normalizedStatus(event)))}>{normalizedStatus(event)}</span></td><td className="px-4 py-4 text-xs">{accountText(event.debit_accounts, (event.debit_requirements ?? []).join(", ") || "None")}</td><td className="px-4 py-4 text-xs">{accountText(event.credit_accounts, (event.credit_requirements ?? []).join(", ") || "None")}</td><td className="px-4 py-4 text-xs">{accountText(event.finance_accounts, "None")}</td><td className="px-4 py-4 text-xs text-muted-foreground">{rowExplanation(event)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </PortalPage>
  );
}
