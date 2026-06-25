"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import ERPPageShell from "@/components/erp/ERPPageShell";
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
const BRIDGE_RECONCILIATION_HREF = ROUTES.admin.accountingBridgeReconciliation;

const FILTERS = ["Action required", "All", "Blocked", "Unsupported", "Postable", "Approval", "Reconciled", "Ready", "Warnings"] as const;
type BridgeFilter = (typeof FILTERS)[number];

const GROUP_ORDER = [
  "Unsupported / Future Boundary",
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
  "Other",
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function normalizedStatus(event: AccountingBridgeReadinessEvent): string {
  return String(event.status || event.canonical_status || "UNKNOWN").toUpperCase();
}

function statusClass(status: string): string {
  const normalized = status.toUpperCase();
  if (["READY", "RECONCILED", "OPEN", "SETUP_READY"].includes(normalized)) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (["POSTABLE", "READY_UNPOSTED", "REVIEW"].includes(normalized)) return "border-blue-200 bg-blue-50 text-blue-900";
  if (normalized === "BLOCKED_BY_APPROVAL") return "border-purple-200 bg-purple-50 text-purple-900";
  if (normalized.includes("WARNING") || normalized === "SKIPPED" || normalized === "BOUNDARY") return "border-amber-200 bg-amber-50 text-amber-950";
  if (normalized.startsWith("BLOCKED") || normalized === "LOCKED") return "border-red-200 bg-red-50 text-red-900";
  if (normalized === "UNSUPPORTED_SOURCE" || normalized.includes("UNSUPPORTED")) return "border-slate-200 bg-slate-50 text-foreground";
  return "border-slate-200 bg-slate-50 text-foreground";
}

function groupName(event: AccountingBridgeReadinessEvent): string {
  const text = `${event.event_group ?? ""} ${event.module ?? ""} ${event.source_module ?? ""} ${event.event_key ?? ""}`.toLowerCase();
  if (isUnsupported(event)) return "Unsupported / Future Boundary";
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

function accountText(accounts: AccountingBridgeReadinessAccount[] | undefined, fallback: string): string {
  return accounts?.length ? accounts.map(accountLabel).join(", ") : fallback;
}

function isUnsupported(event: AccountingBridgeReadinessEvent): boolean {
  const status = normalizedStatus(event);
  return status === "UNSUPPORTED_SOURCE" || status.includes("UNSUPPORTED") || event.supported === false || event.source_workflow_exists === false;
}

function isApprovalGated(event: AccountingBridgeReadinessEvent): boolean {
  return normalizedStatus(event) === "BLOCKED_BY_APPROVAL" || event.approval_ready === false;
}

function isReconciled(event: AccountingBridgeReadinessEvent): boolean {
  return normalizedStatus(event) === "RECONCILED" || event.reconciliation_ready === true;
}

function isPostableSetup(event: AccountingBridgeReadinessEvent): boolean {
  const status = normalizedStatus(event);
  return !isUnsupported(event) && (status === "POSTABLE" || status === "READY_UNPOSTED" || status === "RECONCILED" || status === "READY" || Boolean(event.can_post));
}

function isBusinessReady(event: AccountingBridgeReadinessEvent): boolean {
  return isPostableSetup(event) && isReconciled(event) && !isApprovalGated(event);
}

function missingFields(event: AccountingBridgeReadinessEvent): string[] {
  const fields = new Set<string>(event.missing_fields ?? []);
  if ((event.debit_requirements?.length ?? 0) > 0 && (event.debit_accounts?.length ?? 0) === 0) fields.add("Missing debit account");
  if ((event.credit_requirements?.length ?? 0) > 0 && (event.credit_accounts?.length ?? 0) === 0) fields.add("Missing credit account");
  if ((event.finance_account_ready === false || normalizedStatus(event) === "BLOCKED_BY_MAPPING") && (event.finance_accounts?.length ?? 0) === 0) fields.add("Missing finance account");
  if (event.posting_profile_ready === false || (event.missing_profile_keys?.length ?? 0) > 0) fields.add("Missing posting profile");
  if (event.accounting_period_ready === false || normalizedStatus(event) === "BLOCKED_BY_PERIOD") fields.add("Accounting period not ready");
  if (event.journal_numbering_ready === false || normalizedStatus(event) === "BLOCKED_BY_NUMBERING") fields.add("Document numbering not ready");
  return Array.from(fields);
}

function hasActiveSetupGap(event: AccountingBridgeReadinessEvent): boolean {
  const status = normalizedStatus(event);
  if (isUnsupported(event) || isPostableSetup(event)) return false;
  return status === "BLOCKED_BY_MAPPING" || status === "BLOCKED_BY_PERIOD" || status === "BLOCKED_BY_NUMBERING" || missingFields(event).length > 0 || (event.missing_profile_keys?.length ?? 0) > 0 || event.posting_profile_ready === false;
}

function isWarning(event: AccountingBridgeReadinessEvent): boolean {
  const status = normalizedStatus(event);
  return status.includes("WARNING") || status === "SKIPPED" || Boolean(event.warning_count);
}

function needsOperatorAction(event: AccountingBridgeReadinessEvent): boolean {
  const status = normalizedStatus(event);
  return status.startsWith("BLOCKED") || hasActiveSetupGap(event) || isApprovalGated(event) || isWarning(event);
}

function bridgeReconciliationRoute(status?: string): string {
  return status ? `${BRIDGE_RECONCILIATION_HREF}?status=${encodeURIComponent(status)}` : BRIDGE_RECONCILIATION_HREF;
}

function routeForEvent(event: AccountingBridgeReadinessEvent): string {
  const status = normalizedStatus(event);
  const fields = missingFields(event).join(" ").toLowerCase();
  if (isApprovalGated(event)) return event.safe_next_action_route || event.action_href || bridgeReconciliationRoute("BLOCKED_BY_APPROVAL");
  if (status === "BLOCKED_BY_PERIOD" || fields.includes("period")) return ROUTES.admin.accountingPeriods;
  if (status === "BLOCKED_BY_NUMBERING" || fields.includes("numbering")) return DOCUMENT_NUMBERING_HREF;
  if (fields.includes("finance account")) return ROUTES.admin.accountingFinanceAccounts;
  if (isUnsupported(event)) return ROUTES.admin.accountingSetup;
  if (event.safe_next_action_route) return event.safe_next_action_route;
  if (event.remediation_route) return event.remediation_route;
  if (isPostableSetup(event)) return bridgeReconciliationRoute("READY_UNPOSTED");
  return event.setup_href || event.action_href || MAPPING_AUDIT_HREF;
}

function actionLabel(event: AccountingBridgeReadinessEvent): string {
  const status = normalizedStatus(event);
  if (isApprovalGated(event)) return "Review approval";
  if (isUnsupported(event)) return "Review boundary";
  if (status === "BLOCKED_BY_PERIOD") return "Open periods";
  if (status === "BLOCKED_BY_NUMBERING") return "Open numbering";
  if (missingFields(event).some((field) => field.toLowerCase().includes("finance"))) return "Open finance accounts";
  if (status.startsWith("BLOCKED")) return "Open mapping audit";
  if (isPostableSetup(event)) return "Open bridge reconciliation";
  return event.safe_next_action_label || event.remediation_label || "Open setup";
}

function displayLabel(event: AccountingBridgeReadinessEvent): string {
  const status = normalizedStatus(event);
  if (isUnsupported(event)) return "Unsupported / future boundary";
  if (isApprovalGated(event)) return "Approval required";
  if (isBusinessReady(event)) return "Ready";
  if (isPostableSetup(event)) return "Setup-ready profile";
  if (status === "BLOCKED_BY_MAPPING") return "Setup/mapping missing";
  return status.replaceAll("_", " ");
}

function rowExplanation(event: AccountingBridgeReadinessEvent): string {
  if (isUnsupported(event)) return "This is a future/unsupported source boundary. Do not mark it ready or create fake posting readiness.";
  if (isApprovalGated(event)) return "Accounting setup exists, but controlled bridge posting approval is required.";
  if (isPostableSetup(event) && !isReconciled(event)) return "This is a setup-ready profile. Actual source rows must still be posted and reconciled from the bridge reconciliation workspace when they exist.";
  return event.explanation || event.blocker_reason || event.blocking_reasons?.[0] || event.recommended_action || event.operator_action || "No blocker reported by backend.";
}

function rowMatchesFilter(event: AccountingBridgeReadinessEvent, filter: BridgeFilter): boolean {
  const status = normalizedStatus(event);
  if (filter === "Action required") return needsOperatorAction(event);
  if (filter === "All") return true;
  if (filter === "Blocked") return (status.startsWith("BLOCKED") || hasActiveSetupGap(event)) && !isUnsupported(event);
  if (filter === "Unsupported") return isUnsupported(event);
  if (filter === "Postable") return isPostableSetup(event);
  if (filter === "Approval") return isApprovalGated(event);
  if (filter === "Reconciled") return isReconciled(event);
  if (filter === "Ready") return isBusinessReady(event);
  if (filter === "Warnings") return isWarning(event);
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
    displayLabel(event),
    ...(event.required_profile_keys ?? []),
    ...(event.missing_profile_keys ?? []),
    ...(event.debit_accounts ?? []).map(accountLabel),
    ...(event.credit_accounts ?? []).map(accountLabel),
    ...(event.finance_accounts ?? []).map(accountLabel),
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(needle);
}

function classifyFix(event: AccountingBridgeReadinessEvent): string | null {
  const status = normalizedStatus(event);
  if (status === "BLOCKED_BY_APPROVAL" || isApprovalGated(event)) return "Approval-gated workflows";
  if (hasActiveSetupGap(event)) return "Missing finance/account/profile setup";
  if (status.includes("WARNING") || status === "SKIPPED") return "Skipped/warning rows";
  return null;
}

function groupStats(events: AccountingBridgeReadinessEvent[]) {
  return {
    total: events.length,
    ready: events.filter(isBusinessReady).length,
    setupReady: events.filter(isPostableSetup).length,
    reconciled: events.filter(isReconciled).length,
    approval: events.filter(isApprovalGated).length,
    unsupported: events.filter(isUnsupported).length,
    blockers: events.filter(needsOperatorAction).length,
  };
}

function SummaryCard({ label, value, tone, href }: { label: string; value: number | string; tone: string; href?: string }) {
  const body = (
    <div className={cx("rounded-xl border p-4 shadow-sm", tone)}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={cx("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusClass(value))}>{value}</span>;
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
            <StatusBadge value={status} />
            <StatusBadge value={displayLabel(event)} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Source module: {event.source_module || event.module || "Accounting"} · Event: <span className="font-mono">{event.source_event_key || event.event_key}</span>
          </div>
        </div>
        <Link href={routeForEvent(event)} className="inline-flex rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
          {actionLabel(event)}
        </Link>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">{rowExplanation(event)}</p>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
          <div className="font-semibold text-foreground">Posting setup</div>
          <p className="mt-1 text-muted-foreground">{isPostableSetup(event) ? "Setup ready" : "Not postable"}</p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
          <div className="font-semibold text-foreground">Reconciliation</div>
          <p className="mt-1 text-muted-foreground">{isReconciled(event) ? "Evidence present" : "Evidence pending or not applicable"}</p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
          <div className="font-semibold text-foreground">Missing fields</div>
          <p className="mt-1 text-muted-foreground">{[...missingProfiles, ...fields].length ? [...missingProfiles, ...fields].join(", ") : "None reported"}</p>
        </div>
      </div>

      <details className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <summary className="cursor-pointer font-semibold text-foreground">Show account/profile evidence</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border px-3 py-2 text-xs">
            <div className="font-semibold text-foreground">Debit readiness</div>
            <p className="mt-1 text-muted-foreground">{accountText(event.debit_accounts, fields.some((field) => field.includes("debit")) ? "Missing debit account" : "No debit account required")}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2 text-xs">
            <div className="font-semibold text-foreground">Credit readiness</div>
            <p className="mt-1 text-muted-foreground">{accountText(event.credit_accounts, fields.some((field) => field.includes("credit")) ? "Missing credit account" : "No credit account required")}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2 text-xs">
            <div className="font-semibold text-foreground">Finance-account readiness</div>
            <p className="mt-1 text-muted-foreground">{accountText(event.finance_accounts, fields.some((field) => field.includes("finance")) ? "Missing finance account" : "No finance account required")}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2 text-xs md:col-span-3">
            <div className="font-semibold text-foreground">Required profile keys</div>
            <p className="mt-1 text-muted-foreground">{profileKeys.length ? profileKeys.join(", ") : "Not specified by backend"}</p>
          </div>
        </div>
      </details>
    </article>
  );
}

function GroupedRows({ groupedEvents }: { groupedEvents: Array<[string, AccountingBridgeReadinessEvent[]]> }) {
  if (!groupedEvents.length) {
    return <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No rows match the current filter.</div>;
  }

  return (
    <div className="space-y-4">
      {groupedEvents.map(([group, events]) => {
        const stats = groupStats(events);
        return (
          <section key={group} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{group}</h3>
                <p className="text-sm text-muted-foreground">{stats.total} definition(s) · {stats.setupReady} setup-ready · {stats.blockers} action-required · {stats.unsupported} unsupported.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <StatusBadge value={`total ${stats.total}`} />
                <StatusBadge value={`setup-ready ${stats.setupReady}`} />
                <StatusBadge value={`ready ${stats.ready}`} />
              </div>
            </div>
            <div className="mt-4 space-y-3">{events.map((event) => <BridgeRow key={`${event.source_module}-${event.event_key}`} event={event} />)}</div>
          </section>
        );
      })}
    </div>
  );
}

export default function AccountingBridgeReadinessPage() {
  const [payload, setPayload] = useState<AccountingBridgeReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<BridgeFilter>("Action required");
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
  const actionRequiredEvents = useMemo(() => allEvents.filter(needsOperatorAction), [allEvents]);
  const boundaryEvents = useMemo(() => allEvents.filter(isUnsupported), [allEvents]);
  const filteredEvents = useMemo(() => allEvents.filter((event) => rowMatchesFilter(event, filter) && rowMatchesSearch(event, search)), [allEvents, filter, search]);
  const visibleEvents = filter === "Action required" && !search.trim() ? actionRequiredEvents : filteredEvents;
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
    return ["Missing finance/account/profile setup", "Approval-gated workflows", "Skipped/warning rows"].map((label) => ({ label, rows: buckets.get(label) ?? [] })).filter((item) => item.rows.length > 0);
  }, [allEvents]);

  if (loading) {
    return <ERPPageShell title="Accounting Bridge Readiness" subtitle="Validating bridge mappings and canonical postability."><LoadingBlock label="Loading accounting bridge readiness..." /></ERPPageShell>;
  }

  const summary: Partial<AccountingBridgeReadinessPayload["summary"]> = payload?.summary ?? { source_count: allEvents.length };
  const periodReadiness = payload?.accounting_period_readiness ?? payload?.financial_year_readiness ?? null;
  const totalDefinitions = summary.source_count ?? allEvents.length;
  const setupReadyCount = allEvents.filter(isPostableSetup).length;
  const reconciledCount = allEvents.filter(isReconciled).length;
  const finalReadyCount = allEvents.filter(isBusinessReady).length;
  const unsupportedCount = boundaryEvents.length;
  const activeBlockerCount = actionRequiredEvents.length;
  const bridgeStatus = activeBlockerCount > 0 ? "Action required" : unsupportedCount > 0 ? "Boundary review" : setupReadyCount > 0 ? "Setup ready" : "Needs review";

  return (
    <ERPPageShell
      title="Accounting Bridge Readiness"
      subtitle="Read-only readiness matrix for setup definitions. Real source posting remains inside controlled bridge reconciliation."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Bridge Readiness" }]}
      actions={[{ href: BRIDGE_RECONCILIATION_HREF, label: "Bridge Reconciliation", variant: "primary" }, { href: MAPPING_AUDIT_HREF, label: "Mapping Audit", variant: "secondary" }, { href: ROUTES.admin.accountingSetup, label: "Accounting Setup", variant: "secondary" }]}
      statusBadge={{ label: bridgeStatus, tone: activeBlockerCount > 0 ? "warning" : "success" }}
    >
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load bridge readiness" description={error} onRetry={() => void load()} /> : null}

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting Bridge Readiness</div>
              <h2 className="mt-1 text-xl font-semibold text-foreground">FY {periodReadiness?.active_financial_year?.code ?? "not configured"} · {bridgeStatus}</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                This page summarizes accounting setup definitions only. It does not post, reconcile, approve, close, or mutate operational source records.
              </p>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                Setup-ready profiles are not real pending source rows. Use Bridge Reconciliation only when actual concrete candidates exist.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={BRIDGE_RECONCILIATION_HREF} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open bridge reconciliation</Link>
              <Link href={MAPPING_AUDIT_HREF} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Mapping Audit</Link>
              <Link href={DOCUMENT_NUMBERING_HREF} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Document Numbering</Link>
              <Link href={ROUTES.admin.accountingFinanceAccounts} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Finance Accounts</Link>
              <ActionButton variant="secondary" onClick={() => void load({ silent: true })} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</ActionButton>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryCard label="Setup definitions" value={totalDefinitions} tone="border-slate-200 bg-slate-50 text-foreground" />
            <SummaryCard label="Setup-ready" value={setupReadyCount} tone="border-blue-200 bg-blue-50 text-blue-900" />
            <SummaryCard label="Final-ready" value={finalReadyCount} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
            <SummaryCard label="Reconciled evidence" value={reconciledCount} tone="border-emerald-200 bg-card text-emerald-900" />
            <SummaryCard label="Action required" value={activeBlockerCount} tone={activeBlockerCount ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-900"} />
            <SummaryCard label="Unsupported boundary" value={unsupportedCount} tone="border-slate-200 bg-slate-50 text-foreground" />
          </div>
        </section>

        <WorkspaceSection title="Fix first" description="Only active setup, approval, and warning blockers appear here. Setup-ready profile definitions are not treated as live source-row blockers.">
          {fixFirst.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {fixFirst.map((item) => (
                <Link key={item.label} href={routeForEvent(item.rows[0])} className="rounded-xl border border-border bg-card p-4 shadow-sm hover:bg-muted/40">
                  <div className="text-sm font-semibold text-foreground">{item.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{item.rows.length}</div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.rows[0]?.label}: {rowExplanation(item.rows[0])}</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              No active setup, approval, numbering, period, or warning blocker is exposed by bridge readiness.
            </div>
          )}
        </WorkspaceSection>

        {boundaryEvents.length ? (
          <WorkspaceSection title="Unsupported / future boundaries" description="Visible for auditability only. These rows are not fake-ready and should not be converted into posting workflows without a separate approved phase.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {boundaryEvents.map((event) => (
                <BridgeRow key={`${event.source_module}-${event.event_key}`} event={event} />
              ))}
            </div>
          </WorkspaceSection>
        ) : null}

        <WorkspaceSection title="Readiness definitions" description="Default view shows action-required rows only. Use filters/search when you intentionally need to inspect all setup-ready definitions.">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button key={item} type="button" onClick={() => setFilter(item)} className={cx("rounded-full border px-3 py-1.5 text-xs font-semibold", filter === item ? "border-slate-900 bg-slate-900 text-white" : "border-border bg-background text-foreground hover:bg-muted")}>{item}</button>
              ))}
            </div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event, source, status, profile key, account" className="min-w-[18rem] rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          </div>
          {filter === "Action required" && !search.trim() && visibleEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              No active bridge-readiness rows require operator action. Setup-ready definitions are hidden from the default daily view.
            </div>
          ) : (
            <GroupedRows groupedEvents={groupedEvents} />
          )}
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
