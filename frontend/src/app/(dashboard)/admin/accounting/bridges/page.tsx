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
const BRIDGE_RECONCILIATION_HREF = ROUTES.admin.accountingBridgeReconciliation;

const FILTERS = ["All", "Blocked", "Unsupported", "Postable", "Reconciliation pending", "Approval", "Reconciled", "Ready", "Skipped", "Warnings"] as const;
type BridgeFilter = (typeof FILTERS)[number];

const GROUP_ORDER = [
  "Unsupported / Fallback",
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

const FIX_FIRST_ORDER = [
  "Unsupported source blockers",
  "Missing finance/account/profile setup",
  "Approval-gated workflows",
  "Reconciliation pending",
  "Skipped/warning rows",
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function normalizedStatus(event: AccountingBridgeReadinessEvent): string {
  return String(event.status || event.canonical_status || "UNKNOWN").toUpperCase();
}

function statusClass(status: string): string {
  const normalized = status.toUpperCase();
  if (["READY", "RECONCILED", "OPEN"].includes(normalized)) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (["POSTABLE", "READY_UNPOSTED"].includes(normalized)) return "border-blue-200 bg-blue-50 text-blue-900";
  if (normalized === "BLOCKED_BY_APPROVAL") return "border-purple-200 bg-purple-50 text-purple-900";
  if (normalized.includes("WARNING") || normalized === "SKIPPED") return "border-amber-200 bg-amber-50 text-amber-950";
  if (normalized.startsWith("BLOCKED") || normalized === "LOCKED") return "border-red-200 bg-red-50 text-red-900";
  if (normalized === "UNSUPPORTED_SOURCE" || normalized.includes("UNSUPPORTED")) return "border-red-200 bg-red-50 text-red-900";
  return "border-slate-200 bg-slate-50 text-slate-900";
}

function groupName(event: AccountingBridgeReadinessEvent): string {
  const text = `${event.event_group ?? ""} ${event.module ?? ""} ${event.source_module ?? ""} ${event.event_key ?? ""}`.toLowerCase();
  if (isUnsupported(event)) return "Unsupported / Fallback";
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

function accountText(accounts: AccountingBridgeReadinessAccount[], fallback: string): string {
  return accounts.length ? accounts.map(accountLabel).join(", ") : fallback;
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
  return status === "POSTABLE" || status === "READY_UNPOSTED" || status === "RECONCILED" || status === "READY" || Boolean(event.can_post);
}

function isBusinessReady(event: AccountingBridgeReadinessEvent): boolean {
  return isPostableSetup(event) && isReconciled(event) && !isApprovalGated(event) && !isUnsupported(event);
}

function isReconciliationPending(event: AccountingBridgeReadinessEvent): boolean {
  return isPostableSetup(event) && !isReconciled(event) && !isApprovalGated(event) && !isUnsupported(event);
}

function missingFields(event: AccountingBridgeReadinessEvent): string[] {
  const fields = new Set<string>(event.missing_fields ?? []);
  if ((event.debit_requirements?.length ?? 0) > 0 && event.debit_accounts.length === 0) fields.add("Missing debit account");
  if ((event.credit_requirements?.length ?? 0) > 0 && event.credit_accounts.length === 0) fields.add("Missing credit account");
  if (event.finance_account_ready === false || normalizedStatus(event) === "BLOCKED_BY_MAPPING") {
    if (event.finance_accounts.length === 0) fields.add("Missing finance account");
  }
  if (event.posting_profile_ready === false || (event.missing_profile_keys?.length ?? 0) > 0) fields.add("Missing posting profile");
  if (event.accounting_period_ready === false || normalizedStatus(event) === "BLOCKED_BY_PERIOD") fields.add("Accounting period not ready");
  if (event.journal_numbering_ready === false || normalizedStatus(event) === "BLOCKED_BY_NUMBERING") fields.add("Document numbering not ready");
  return Array.from(fields);
}

function hasSetupGap(event: AccountingBridgeReadinessEvent): boolean {
  const status = normalizedStatus(event);
  const fields = missingFields(event).join(" ").toLowerCase();
  return status === "BLOCKED_BY_MAPPING" || fields.includes("missing") || (event.missing_profile_keys?.length ?? 0) > 0 || event.posting_profile_ready === false;
}

function bridgeReconciliationRoute(status?: string): string {
  return status ? `${BRIDGE_RECONCILIATION_HREF}?status=${encodeURIComponent(status)}` : BRIDGE_RECONCILIATION_HREF;
}

function routeForEvent(event: AccountingBridgeReadinessEvent): string {
  if (isReconciliationPending(event)) return bridgeReconciliationRoute("READY_UNPOSTED");
  const status = normalizedStatus(event);
  const fields = missingFields(event).join(" ").toLowerCase();
  if (isApprovalGated(event)) return event.safe_next_action_route || event.action_href || bridgeReconciliationRoute("BLOCKED_BY_APPROVAL");
  if (status === "BLOCKED_BY_PERIOD" || fields.includes("period")) return ROUTES.admin.accountingPeriods;
  if (status === "BLOCKED_BY_NUMBERING" || fields.includes("numbering")) return DOCUMENT_NUMBERING_HREF;
  if (fields.includes("finance account")) return ROUTES.admin.accountingFinanceAccounts;
  if (isUnsupported(event)) return ROUTES.admin.accountingFinanceAccounts;
  if (event.safe_next_action_route) return event.safe_next_action_route;
  if (event.remediation_route) return event.remediation_route;
  return event.setup_href || event.action_href || MAPPING_AUDIT_HREF;
}

function actionLabel(event: AccountingBridgeReadinessEvent): string {
  const status = normalizedStatus(event);
  if (isReconciliationPending(event)) return "Open bridge reconciliation";
  if (isApprovalGated(event)) return "Review controlled approval";
  if (isUnsupported(event)) return "Review unsupported source";
  if (isBusinessReady(event)) return "Review ready evidence";
  if (status === "RECONCILED") return "Review evidence";
  if (status === "BLOCKED_BY_PERIOD") return "Open periods";
  if (status === "BLOCKED_BY_NUMBERING") return "Open numbering";
  if (missingFields(event).some((field) => field.toLowerCase().includes("finance"))) return "Open finance accounts";
  if (status.startsWith("BLOCKED")) return "Open mapping audit";
  return event.safe_next_action_label || event.remediation_label || "Open setup";
}

function displayLabel(event: AccountingBridgeReadinessEvent): string {
  const status = normalizedStatus(event);
  if (isUnsupported(event)) return "Unsupported source";
  if (isApprovalGated(event)) return "Approval required";
  if (isReconciliationPending(event)) return "Postable · Reconciliation pending";
  if (isBusinessReady(event)) return "Ready";
  if (status === "BLOCKED_BY_MAPPING") return "Setup/mapping missing";
  return status.replaceAll("_", " ");
}

function rowExplanation(event: AccountingBridgeReadinessEvent): string {
  if (isUnsupported(event)) return "Do not create fake posting readiness. Implement or disable the source workflow before this can become postable.";
  if (isApprovalGated(event)) return "Accounting setup exists, but controlled bridge posting approval is required.";
  if (isReconciliationPending(event)) return "Accounting setup is complete enough to be postable, but reconciliation evidence is still pending. Use bridge reconciliation, not mapping audit.";
  return event.explanation || event.blocker_reason || event.blocking_reasons?.[0] || event.recommended_action || event.operator_action || "No blocker reported by backend.";
}

function rowMatchesFilter(event: AccountingBridgeReadinessEvent, filter: BridgeFilter): boolean {
  const status = normalizedStatus(event);
  const blocker = Boolean(event.is_posting_blocker ?? event.is_close_blocker ?? status.startsWith("BLOCKED"));
  if (filter === "All") return true;
  if (filter === "Blocked") return blocker && !isUnsupported(event);
  if (filter === "Unsupported") return isUnsupported(event);
  if (filter === "Postable") return isPostableSetup(event);
  if (filter === "Reconciliation pending") return isReconciliationPending(event);
  if (filter === "Approval") return isApprovalGated(event);
  if (filter === "Reconciled") return isReconciled(event);
  if (filter === "Ready") return isBusinessReady(event);
  if (filter === "Skipped") return status === "SKIPPED";
  if (filter === "Warnings") return status.includes("WARNING") || Boolean(event.warning_count);
  return true;
}

function rowMatchesSearch(event: AccountingBridgeReadinessEvent, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [event.label, event.event_label, event.event_key, event.source_event_key, event.source_module, event.module, event.event_group, event.source_model, event.status, event.canonical_status, displayLabel(event), ...(event.required_profile_keys ?? []), ...(event.missing_profile_keys ?? []), ...event.debit_accounts.map(accountLabel), ...event.credit_accounts.map(accountLabel), ...event.finance_accounts.map(accountLabel)].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(needle);
}

function classifyFix(event: AccountingBridgeReadinessEvent): string | null {
  const status = normalizedStatus(event);
  if (isUnsupported(event)) return "Unsupported source blockers";
  if (hasSetupGap(event)) return "Missing finance/account/profile setup";
  if (isApprovalGated(event)) return "Approval-gated workflows";
  if (isReconciliationPending(event) || event.reconciliation_ready === false || status.includes("RECONCILIATION")) return "Reconciliation pending";
  if (status.includes("WARNING") || status === "SKIPPED") return "Skipped/warning rows";
  return null;
}

function groupStats(events: AccountingBridgeReadinessEvent[]) {
  return { total: events.length, ready: events.filter(isBusinessReady).length, postable: events.filter(isPostableSetup).length, reconciled: events.filter(isReconciled).length, approval: events.filter(isApprovalGated).length, unsupported: events.filter(isUnsupported).length, pending: events.filter(isReconciliationPending).length, setup: events.filter(hasSetupGap).length };
}

function SummaryCard({ label, value, tone, href }: { label: string; value: number | string; tone: string; href?: string }) {
  const body = <div className={cx("rounded-xl border p-4 shadow-sm", tone)}><div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
  return href ? <Link href={href}>{body}</Link> : body;
}

function readinessPill(label: string, ok: boolean, blockedText = "Blocked") {
  return <span className={cx("inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold", ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950")}>{label}: {ok ? "Ready" : blockedText}</span>;
}

function BridgeRow({ event }: { event: AccountingBridgeReadinessEvent }) {
  const status = normalizedStatus(event);
  const fields = missingFields(event);
  const profileKeys = event.required_profile_keys ?? event.debit_requirements ?? event.credit_requirements ?? [];
  const missingProfiles = event.missing_profile_keys ?? [];
  const postingReady = isPostableSetup(event);
  const reconciliationReady = isReconciled(event);
  const approvalReady = !isApprovalGated(event);
  const unsupported = isUnsupported(event);

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold text-foreground">{event.label || event.event_label || event.event_key}</h3><span className={cx("rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusClass(status))}>{status}</span><span className={cx("rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusClass(displayLabel(event)))}>{displayLabel(event)}</span></div>
          <div className="mt-1 text-xs text-muted-foreground">Source module: {event.source_module || event.module || "Accounting"} · Event: <span className="font-mono">{event.source_event_key || event.event_key}</span></div>
        </div>
        <Link href={routeForEvent(event)} className="inline-flex rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">{actionLabel(event)}</Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4"><div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Posting readiness</div><div className="mt-2 flex flex-wrap gap-1">{readinessPill("Posting", postingReady, "Not postable")}</div><p className="mt-2 text-muted-foreground">{postingReady ? "Mapping, period, and numbering gates are ready." : "Posting setup still has a blocker."}</p></div><div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Reconciliation readiness</div><div className="mt-2 flex flex-wrap gap-1">{readinessPill("Reconciliation", reconciliationReady, "Pending")}</div><p className="mt-2 text-muted-foreground">{reconciliationReady ? "Reconciliation evidence is present." : "Open bridge reconciliation before treating this as final-ready."}</p></div><div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Approval readiness</div><div className="mt-2 flex flex-wrap gap-1">{readinessPill("Approval", approvalReady, "Required")}</div><p className="mt-2 text-muted-foreground">{approvalReady ? "No controlled approval blocker is reported." : "Controlled admin approval is required; this is not a mapping setup failure."}</p></div><div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Unsupported-source state</div><div className="mt-2 flex flex-wrap gap-1">{readinessPill("Source", !unsupported, "Unsupported")}</div><p className="mt-2 text-muted-foreground">{unsupported ? "Do not fake readiness. Implement or disable the source workflow." : "Real source workflow is available."}</p></div></div>
      <div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Debit readiness</div><p className="mt-1 text-muted-foreground">{accountText(event.debit_accounts, fields.some((field) => field.includes("debit")) ? "Missing debit account" : "No debit account required")}</p></div><div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Credit readiness</div><p className="mt-1 text-muted-foreground">{accountText(event.credit_accounts, fields.some((field) => field.includes("credit")) ? "Missing credit account" : "No credit account required")}</p></div><div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Finance-account readiness</div><p className="mt-1 text-muted-foreground">{accountText(event.finance_accounts, fields.some((field) => field.includes("finance")) ? "Missing finance account" : "No finance account required")}</p></div></div>
      <div className="mt-3 grid gap-3 md:grid-cols-3"><div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Required profile keys</div><p className="mt-1 text-muted-foreground">{profileKeys.length ? profileKeys.join(", ") : "Not specified by backend"}</p></div><div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Missing fields</div><p className="mt-1 text-muted-foreground">{[...missingProfiles, ...fields].length ? [...missingProfiles, ...fields].join(", ") : "None reported"}</p></div><div className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold text-foreground">Recommended action route</div><Link href={routeForEvent(event)} className="mt-1 inline-flex font-semibold text-primary underline underline-offset-4">{routeForEvent(event)}</Link></div></div>
      <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" open={status.startsWith("BLOCKED") || unsupported || isReconciliationPending(event)}><summary className="cursor-pointer font-semibold">Why blocked?</summary><p className="mt-2 leading-6">{rowExplanation(event)}</p><p className="mt-2 text-xs">Blocks posting: {String(Boolean(event.is_posting_blocker ?? status.startsWith("BLOCKED") || unsupported))} · Blocks close: {String(Boolean(event.is_close_blocker ?? (status.startsWith("BLOCKED") || unsupported || isReconciliationPending(event))))}</p></details>
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
    if (silent) setRefreshing(true); else setLoading(true);
    setError(null);
    try { setPayload(await getAccountingBridgeReadiness()); } catch (err) { setError(err instanceof Error ? err.message : "Failed to load accounting bridge readiness."); } finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { void load(); }, []);

  const allEvents = useMemo(() => payload?.events ?? [], [payload?.events]);
  const visibleEvents = useMemo(() => allEvents.filter((event) => rowMatchesFilter(event, filter) && rowMatchesSearch(event, search)), [allEvents, filter, search]);
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, AccountingBridgeReadinessEvent[]>();
    for (const event of visibleEvents) { const key = groupName(event); groups.set(key, [...(groups.get(key) ?? []), event]); }
    return Array.from(groups.entries()).sort(([a], [b]) => { const ai = GROUP_ORDER.indexOf(a); const bi = GROUP_ORDER.indexOf(b); if (ai === -1 && bi === -1) return a.localeCompare(b); if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi; });
  }, [visibleEvents]);
  const fixFirst = useMemo(() => { const buckets = new Map<string, AccountingBridgeReadinessEvent[]>(); for (const event of allEvents) { const bucket = classifyFix(event); if (bucket) buckets.set(bucket, [...(buckets.get(bucket) ?? []), event]); } return FIX_FIRST_ORDER.map((label) => ({ label, rows: buckets.get(label) ?? [] })).filter((item) => item.rows.length > 0); }, [allEvents]);

  if (loading) return <PortalPage title="Accounting Bridge Readiness" subtitle="Validating bridge mappings and canonical postability."><LoadingBlock label="Loading accounting bridge readiness..." /></PortalPage>;

  const summary: Partial<AccountingBridgeReadinessPayload["summary"]> = payload?.summary ?? { source_count: allEvents.length };
  const periodReadiness = payload?.accounting_period_readiness ?? payload?.financial_year_readiness ?? null;
  const totalRows = summary.source_count ?? allEvents.length;
  const activeSourceCount = allEvents.filter((event) => event.source_workflow_exists !== false && event.supported !== false).length;
  const postableCount = allEvents.filter(isPostableSetup).length;
  const reconciledCount = allEvents.filter(isReconciled).length;
  const readyCount = allEvents.filter(isBusinessReady).length;
  const approvalCount = allEvents.filter(isApprovalGated).length;
  const unsupportedCount = allEvents.filter(isUnsupported).length;
  const reconciliationPendingCount = allEvents.filter(isReconciliationPending).length;
  const setupMissingCount = allEvents.filter(hasSetupGap).length;
  const skippedWarningCount = allEvents.filter((event) => normalizedStatus(event) === "SKIPPED" || normalizedStatus(event).includes("WARNING") || Boolean(event.warning_count)).length;
  const setupMostlyReady = postableCount > setupMissingCount;
  const bridgeStatus = unsupportedCount || approvalCount || reconciliationPendingCount || setupMissingCount ? "Blocked" : readyCount ? "Ready" : "Needs review";

  return (
    <PortalPage title="Accounting Bridge Readiness" subtitle="Operator-first control center for what is postable, reconciled, blocked, and ready. This page is read-only." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Bridge Readiness" }]} actions={[{ href: MAPPING_AUDIT_HREF, label: "Mapping Audit", variant: "secondary" }, { href: BRIDGE_RECONCILIATION_HREF, label: "Bridge Reconciliation", variant: "secondary" }, { href: ROUTES.admin.accountingSetup, label: "Accounting Setup", variant: "secondary" }]} statusBadge={{ label: bridgeStatus, tone: bridgeStatus === "Ready" ? "success" : "warning" }}>
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load bridge readiness" description={error} onRetry={() => void load()} /> : null}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting Bridge Readiness</div><h2 className="mt-1 text-xl font-semibold text-foreground">FY {periodReadiness?.active_financial_year?.code ?? "not configured"} · {bridgeStatus}</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Postable means accounting setup is complete. Ready means the event is postable, reconciled, and not blocked by approval or unsupported source.</p><p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Current interpretation: {setupMostlyReady ? "Setup mostly ready" : "Setup needs remediation"}; reconciliation pending; Staff advance unsupported; approval-gated workflows pending controlled approval.</p></div><div className="flex flex-wrap gap-2"><Link href={MAPPING_AUDIT_HREF} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Mapping Audit</Link><Link href={BRIDGE_RECONCILIATION_HREF} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open bridge reconciliation</Link><Link href={ROUTES.admin.accountingSetup} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Accounting Setup</Link><Link href={DOCUMENT_NUMBERING_HREF} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Document Numbering</Link><Link href={ROUTES.admin.accountingFinanceAccounts} className="rounded-xl border px-3 py-2 text-sm font-semibold">Open Finance Accounts</Link><ActionButton variant="secondary" onClick={() => void load({ silent: true })} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</ActionButton></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><SummaryCard label="Active sources" value={activeSourceCount} tone="border-slate-200 bg-slate-50 text-slate-900" /><SummaryCard label="Total profiles" value={summary.source_count ?? totalRows} tone="border-slate-200 bg-slate-50 text-slate-900" /><SummaryCard label="Postable" value={postableCount} tone="border-blue-200 bg-blue-50 text-blue-900" /><SummaryCard label="Reconciled" value={reconciledCount} tone="border-emerald-200 bg-white text-emerald-900" /><SummaryCard label="Ready" value={readyCount} tone="border-emerald-200 bg-emerald-50 text-emerald-900" /><SummaryCard label="Blocked by approval" value={approvalCount} tone="border-purple-200 bg-purple-50 text-purple-900" href={bridgeReconciliationRoute("BLOCKED_BY_APPROVAL")} /><SummaryCard label="Unsupported source" value={unsupportedCount} tone="border-red-200 bg-red-50 text-red-900" /><SummaryCard label="Reconciliation pending" value={reconciliationPendingCount} tone="border-amber-200 bg-amber-50 text-amber-950" href={bridgeReconciliationRoute("READY_UNPOSTED")} /><SummaryCard label="Setup/mapping missing" value={setupMissingCount} tone="border-red-200 bg-red-50 text-red-900" href={MAPPING_AUDIT_HREF} /><SummaryCard label="Skipped/warnings" value={skippedWarningCount} tone="border-slate-200 bg-slate-50 text-slate-900" /><SummaryCard label="Total rows" value={totalRows} tone="border-slate-200 bg-slate-50 text-slate-900" /><SummaryCard label="Current status" value={bridgeStatus} tone={bridgeStatus === "Ready" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"} /></div></section>
        <WorkspaceSection title="Fix first" description="Ranked by close/posting severity. Reconciliation exceptions route to bridge reconciliation, not mapping audit.">{fixFirst.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{fixFirst.map((item) => <Link key={item.label} href={routeForEvent(item.rows[0])} className="rounded-xl border border-border bg-card p-4 shadow-sm hover:bg-muted/40"><div className="text-sm font-semibold text-foreground">{item.label}</div><div className="mt-2 text-2xl font-semibold">{item.rows.length}</div><p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{item.rows[0].label || item.rows[0].event_key}: {rowExplanation(item.rows[0])}</p></Link>)}</div> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">No blocker buckets found in the current readiness payload.</div>}</WorkspaceSection>
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{FILTERS.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cx("rounded-full border px-3 py-1.5 text-xs font-semibold", filter === item ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground")}>{item}</button>)}</div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event, source, status, profile key, account" className="min-h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground lg:w-96" /></div></section>
        {groupedEvents.map(([name, events]) => { const stats = groupStats(events); return <WorkspaceSection key={name} title={name} description="Grouped bridge rows show posting readiness, reconciliation readiness, approval readiness, unsupported-source state, and safest next route."><div className="mb-3 grid gap-2 sm:grid-cols-4 xl:grid-cols-8">{Object.entries(stats).map(([label, value]) => <div key={`${name}-${label}`} className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><div className="font-semibold capitalize text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold text-foreground">{value}</div></div>)}</div><div className="grid gap-3">{events.map((event) => <BridgeRow key={event.event_key} event={event} />)}</div></WorkspaceSection>; })}
        <details className="rounded-2xl border border-border bg-card p-5 shadow-sm"><summary className="cursor-pointer text-base font-semibold text-foreground">Advanced raw readiness</summary><div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-background shadow-sm"><table className="min-w-full divide-y divide-border text-sm"><thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Canonical status</th><th className="px-4 py-3">Posting</th><th className="px-4 py-3">Reconciliation</th><th className="px-4 py-3">Approval</th><th className="px-4 py-3">Unsupported</th><th className="px-4 py-3">Backend reason</th></tr></thead><tbody className="divide-y divide-border">{allEvents.map((event) => <tr key={`raw-${event.event_key}`} className="align-top"><td className="px-4 py-4"><div className="font-semibold">{event.label}</div><div className="font-mono text-xs text-muted-foreground">{event.event_key}</div></td><td className="px-4 py-4"><span className={cx("rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(normalizedStatus(event)))}>{normalizedStatus(event)}</span></td><td className="px-4 py-4 text-xs">{isPostableSetup(event) ? "Postable" : "Not postable"}</td><td className="px-4 py-4 text-xs">{isReconciled(event) ? "Reconciled" : "Pending"}</td><td className="px-4 py-4 text-xs">{isApprovalGated(event) ? "Approval required" : "Ready"}</td><td className="px-4 py-4 text-xs">{isUnsupported(event) ? "Unsupported source" : "Supported source"}</td><td className="px-4 py-4 text-xs text-muted-foreground">{rowExplanation(event)}</td></tr>)}</tbody></table></div></details>
      </div>
    </PortalPage>
  );
}
