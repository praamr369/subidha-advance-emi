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
  postBridgeCandidate,
  postBridgeCandidateBatch,
  previewBridgeCandidate,
  previewBridgeCandidateBatch,
  verifyBridgeReconciliationItem,
  type AccountingBridgeReconciliationFilters,
  type AccountingBridgeReconciliationPayload,
  type AccountingBridgeReconciliationRow,
  type BridgePostingPreview,
} from "@/services/accounting-bridge-reconciliation";
import {
  applyAccountingMappingRemediation,
  createAccountingMappingRemediationAccount,
  getAccountingMappingRemediation,
  seedSupportedAccountingMappings,
  type AccountingMappingRemediationPayload,
  type AccountingMappingRemediationRow,
} from "@/services/accounting-mapping-remediation";

const MAPPING_AUDIT_HREF = "/admin/accounting/setup/mapping-audit";
const DOCUMENT_NUMBERING_HREF = ROUTES.admin.settingsBusinessSetupDocumentNumbering;
const STATUS_OPTIONS = ["", "POSTABLE", "READY_UNPOSTED", "POSTED", "RECONCILED", "BLOCKED_BY_MAPPING", "BLOCKED_BY_PERIOD", "BLOCKED_BY_NUMBERING", "BLOCKED_BY_APPROVAL", "UNSUPPORTED_SOURCE", "EXCEPTION"];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusClass(status: string): string {
  const value = status.toUpperCase();
  if (["OPEN", "RECONCILED", "POSTED", "POSTABLE", "READY"].includes(value)) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (value === "READY_UNPOSTED") return "border-blue-200 bg-blue-50 text-blue-900";
  if (value === "LOCKED" || value.startsWith("BLOCKED")) return "border-amber-200 bg-amber-50 text-amber-950";
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
  return remediation?.action_label || "Seed Supported Mappings";
}

export default function AccountingBridgeReconciliationPage() {
  const [payload, setPayload] = useState<AccountingBridgeReconciliationPayload | null>(null);
  const [remediation, setRemediation] = useState<AccountingMappingRemediationPayload | null>(null);
  const [filters, setFilters] = useState<AccountingBridgeReconciliationFilters>({});
  const [draftFilters, setDraftFilters] = useState<AccountingBridgeReconciliationFilters>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<BridgePostingPreview | null>(null);
  const [postingNote, setPostingNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (nextFilters: AccountingBridgeReconciliationFilters = {}, opts: { silent?: boolean } = {}) => {
    if (opts.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [bridgePayload, remediationPayload] = await Promise.all([getAccountingBridgeReconciliation(nextFilters), getAccountingMappingRemediation()]);
      setPayload(bridgePayload);
      setRemediation(remediationPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bridge reconciliation cockpit.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = filtersFromLocation();
    setFilters(initial);
    setDraftFilters(initial);
    void load(initial);
  }, [load]);

  const remediationByEvent = useMemo(() => {
    const map = new Map<string, AccountingMappingRemediationRow>();
    for (const row of remediation?.rows ?? []) map.set(row.event_type, row);
    return map;
  }, [remediation]);

  const rows = payload?.results ?? [];
  const candidateRows = rows.filter((row) => row.row_type === "bridge_candidate" && row.bridge_candidate_id);
  const exceptionRows = rows.filter((row) => row.status === "EXCEPTION" || row.exception_reasons.length > 0 || row.status.startsWith("BLOCKED") || row.status === "UNSUPPORTED_SOURCE");
  const selectedFinancialYear = payload?.selected_financial_year ?? payload?.accounting_period_readiness?.active_financial_year ?? payload?.financial_year_readiness?.active_financial_year ?? null;
  const selectedPeriod = payload?.selected_accounting_period ?? payload?.accounting_period_readiness?.current_period ?? payload?.financial_year_readiness?.current_period ?? null;
  const readinessBlockers = payload?.readiness_blockers ?? payload?.accounting_period_readiness?.blockers ?? payload?.financial_year_readiness?.blockers ?? [];
  const availableFinancialYears = payload?.available_financial_years ?? [];
  const availablePeriods = payload?.available_accounting_periods ?? [];
  const summary = payload?.summary ?? { source_count: 0, ready_unposted_count: 0, blocked_count: 0, posted_count: 0, settled_count: 0, reconciled_count: 0, exception_count: 0 };
  const selectedCandidateRows = candidateRows.filter((row) => row.bridge_candidate_id && selectedCandidateIds.includes(row.bridge_candidate_id));
  const selectedAllPostable = selectedCandidateRows.length > 0 && selectedCandidateRows.every(isConcretePostableCandidate);

  function statusHref(status: string) {
    return `${ROUTES.admin.accountingBridgeReconciliation}?${new URLSearchParams({ ...(selectedFinancialYear?.id ? { financial_year: String(selectedFinancialYear.id) } : {}), status }).toString()}`;
  }

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

  function isConcretePostableCandidate(row: AccountingBridgeReconciliationRow): boolean {
    return row.row_type === "bridge_candidate" && Boolean(row.bridge_candidate_id && row.idempotency_key && row.can_post && row.status === "READY_UNPOSTED");
  }

  function isConcretePreviewCandidate(row: AccountingBridgeReconciliationRow): boolean {
    return row.row_type === "bridge_candidate" && Boolean(row.bridge_candidate_id && row.can_preview);
  }

  function toggleCandidate(candidateId: string, checked: boolean) {
    setSelectedCandidateIds((current) => checked ? Array.from(new Set([...current, candidateId])) : current.filter((id) => id !== candidateId));
  }

  async function handlePreviewCandidate(candidateId: string) {
    setActionBusy(`preview:${candidateId}`);
    setError(null);
    try {
      setPreview(await previewBridgeCandidate(candidateId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview bridge candidate.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handlePostCandidate(candidateId: string, idempotencyKey?: string | null) {
    if (!idempotencyKey) return;
    if (!window.confirm("Post this bridge candidate now? This creates a JournalEntry and pending reconciliation item. Source payment, EMI, receipt, and invoice values are not changed.")) return;
    setActionBusy(`post:${candidateId}`);
    setError(null);
    try {
      const result = await postBridgeCandidate(candidateId, { idempotency_key: idempotencyKey, confirm: true, posting_note: postingNote });
      setNotice(result.posted ? "Bridge journal posted. Reconciliation remains pending until checks and verification complete." : "Candidate was already posted with the same idempotency key.");
      setPreview(null);
      setSelectedCandidateIds((current) => current.filter((id) => id !== candidateId));
      await load(filters, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post bridge candidate.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleBatchPreview() {
    if (selectedCandidateIds.length === 0) return;
    setActionBusy("batch-preview");
    setError(null);
    try {
      const result = await previewBridgeCandidateBatch(selectedCandidateIds);
      setNotice(`Batch preview: ${result.postable_count} postable, ${result.blocked_count} blocked, total debit ${result.total_debit}, total credit ${result.total_credit}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview selected candidates.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleBatchPost() {
    const selectedRows = candidateRows.filter((row) => row.bridge_candidate_id && selectedCandidateIds.includes(row.bridge_candidate_id));
    if (selectedRows.length === 0 || !selectedRows.every(isConcretePostableCandidate)) return;
    if (!window.confirm(`Post ${selectedRows.length} selected bridge candidate(s)? This creates accounting journals and pending reconciliation items only.`)) return;
    setActionBusy("batch-post");
    setError(null);
    try {
      const idempotencyKeys = Object.fromEntries(selectedRows.map((row) => [row.bridge_candidate_id as string, row.idempotency_key as string]));
      const result = await postBridgeCandidateBatch({ candidate_ids: selectedCandidateIds, idempotency_keys: idempotencyKeys, confirm: true, posting_note: postingNote });
      setNotice(`Batch post complete: ${result.posted_count} posted, ${result.skipped_already_posted_count} already posted, ${result.blocked_count} blocked.`);
      setSelectedCandidateIds([]);
      await load(filters, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post selected candidates.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleVerify(row: AccountingBridgeReconciliationRow) {
    if (!row.existing_reconciliation_item_id) return;
    setActionBusy(`verify:${row.existing_reconciliation_item_id}`);
    setError(null);
    try {
      await verifyBridgeReconciliationItem(row.existing_reconciliation_item_id, { note: "Verified from bridge reconciliation cockpit." });
      setNotice("Bridge reconciliation item verified.");
      await load(filters, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify reconciliation item.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleSeedDefaults() {
    setActionBusy("seed");
    setNotice(null);
    try {
      const result = await seedSupportedAccountingMappings();
      setNotice(`Supported setup defaults seeded. Journals created: ${result.journal_entries_created}; numbering profiles created: ${result.document_sequences_allocated}.`);
      await load(filters, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed supported mapping defaults.");
    } finally {
      setActionBusy(null);
    }
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
    if (row.row_type === "bridge_candidate") {
      const candidateId = row.bridge_candidate_id || row.id;
      const canPost = isConcretePostableCandidate(row);
      return <div className="flex flex-col gap-2 text-xs"><button type="button" disabled={!candidateId || !isConcretePreviewCandidate(row) || actionBusy === `preview:${candidateId}`} onClick={() => candidateId ? void handlePreviewCandidate(candidateId) : undefined} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left font-semibold text-blue-900">{actionBusy === `preview:${candidateId}` ? "Previewing..." : "Preview"}</button>{canPost ? <button type="button" disabled={!candidateId || actionBusy === `preview:${candidateId}`} onClick={() => candidateId ? void handlePreviewCandidate(candidateId) : undefined} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left font-semibold text-emerald-900">Preview to post</button> : <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">Post disabled: {row.blocker_reason || row.status}</span>}{row.journal_entry?.id ? <Link href={`${ROUTES.admin.accountingJournals}/${row.journal_entry.id}`} className="font-semibold text-primary underline underline-offset-4">View journal</Link> : null}{row.status === "POSTED" && row.existing_reconciliation_item_id ? <button type="button" disabled={actionBusy === `verify:${row.existing_reconciliation_item_id}`} onClick={() => void handleVerify(row)} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-left font-semibold text-emerald-900">Verify</button> : null}</div>;
    }
    if ((row.status === "POSTABLE" || row.status === "READY_UNPOSTED") && row.row_type !== "bridge_candidate") {
      return <div className="flex flex-col gap-2 text-xs"><Link href={`${ROUTES.admin.accountingBridgeReconciliation}?event_key=${encodeURIComponent(row.event_key)}&source_model=${encodeURIComponent(row.source_model || "")}`} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-900">View source items</Link><span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">Posting requires a concrete source item. Abstract event rows cannot be posted.</span></div>;
    }
    const current = remediationByEvent.get(row.event_key);
    if (row.status === "UNSUPPORTED_SOURCE" || row.event_key === "staff_advance" || current?.status === "UNSUPPORTED_SOURCE") {
      return <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"><div className="font-semibold">Unsupported source</div><div>StaffAdvance workflow not enabled. No Post button is available.</div><Link href={MAPPING_AUDIT_HREF} className="mt-2 inline-flex underline underline-offset-4">Open mapping audit</Link></div>;
    }
    if (row.status === "BLOCKED_BY_PERIOD") return <div className="flex flex-col gap-2 text-xs"><span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">{row.period_blocker_reason || row.blocker_reason || "Locked, closed, missing, outside-FY, or posting-lock period blocker."}</span><Link href={ROUTES.admin.accountingPeriods} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-950">Open accounting periods</Link></div>;
    if (row.status === "BLOCKED_BY_NUMBERING") return <Link href={DOCUMENT_NUMBERING_HREF} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">Open document numbering</Link>;
    if (row.status === "BLOCKED_BY_APPROVAL") return <Link href={ROUTES.admin.accountingBridges} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">Review approval gate</Link>;
    if (row.status === "BLOCKED_BY_MAPPING" || current?.status === "MISSING_ACCOUNT" || current?.status === "ACCOUNT_EXISTS_UNMAPPED") {
      return <div className="flex flex-col gap-2 text-xs">{current?.can_auto_create_account ? <button type="button" disabled={actionBusy === `${row.event_key}:create`} onClick={() => void handleCreateAccount(row.event_key)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left font-semibold text-amber-950">{actionBusy === `${row.event_key}:create` ? "Creating..." : remediationLabel(row, current)}</button> : null}{current?.can_map_account ? <button type="button" disabled={actionBusy === `${row.event_key}:map`} onClick={() => void handleApplyMapping(row.event_key, current.existing_account_id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left font-semibold text-emerald-900">{actionBusy === `${row.event_key}:map` ? "Mapping..." : remediationLabel(row, current)}</button> : null}{!current?.can_auto_create_account && !current?.can_map_account ? <button type="button" disabled={actionBusy === "seed"} onClick={() => void handleSeedDefaults()} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left font-semibold text-amber-950">Seed Supported Mappings</button> : null}<Link href={current?.action_href || row.action_href || MAPPING_AUDIT_HREF} className="rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground">Open mapping audit/setup</Link><span className="text-muted-foreground">{current?.recommended_action || row.recommended_action || row.operator_action}</span></div>;
    }
    if (row.journal_entry?.id) return <Link href={`${ROUTES.admin.accountingJournals}/${row.journal_entry.id}`} className="text-xs font-semibold text-primary underline underline-offset-4">Open journal</Link>;
    return <span className="text-xs text-muted-foreground">No action required.</span>;
  }

  if (loading) return <PortalPage title="Accounting Bridge Reconciliation" subtitle="Guided accounting remediation across bridge readiness, posting, settlement, and reconciliation."><LoadingBlock label="Loading bridge reconciliation cockpit..." /></PortalPage>;

  return (
    <PortalPage title="Accounting Bridge Reconciliation" subtitle="Canonical postability drilldown. Open period is valid for posting; locked, closed, missing, outside-FY, or posting-locked periods block posting." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Bridge Reconciliation" }]} actions={[{ href: MAPPING_AUDIT_HREF, label: "Mapping Audit", variant: "secondary" }, { href: ROUTES.admin.accountingPeriods, label: "Accounting Periods", variant: "secondary" }, { href: ROUTES.admin.accountingBridges, label: "Bridge Readiness", variant: "secondary" }]} statusBadge={{ label: "Canonical Postability", tone: "info" }}>
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load bridge reconciliation" description={error} onRetry={() => void load(filters)} /> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting operations path</div><h2 className="mt-1 text-xl font-semibold text-foreground">Fix mapping → preview/post bridge → verify reconciliation → close period/year</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Create/map/seed actions only repair setup metadata; they do not create JournalEntry, issue document numbers, or post bridge rows. Unsupported source is not a mapping problem; implement or enable the source workflow before posting.</p></div><div className="flex flex-wrap gap-2"><ActionButton variant="primary" onClick={() => void handleSeedDefaults()} disabled={Boolean(actionBusy)}>{actionBusy === "seed" ? "Seeding..." : "Seed Safe Defaults"}</ActionButton><ActionButton variant="secondary" onClick={() => void load(filters, { silent: true })} disabled={refreshing}>{refreshing ? "Refreshing..." : "Recheck"}</ActionButton></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><SummaryCard label="POSTABLE" value={Number(summary.postable_count ?? 0)} tone="border-emerald-200 bg-emerald-50 text-emerald-900" href={statusHref("POSTABLE")} /><SummaryCard label="READY_UNPOSTED" value={Number(summary.ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={statusHref("READY_UNPOSTED")} /><SummaryCard label="POSTED" value={Number(summary.posted_count ?? 0)} tone="border-emerald-200 bg-white text-emerald-900" href={statusHref("POSTED")} /><SummaryCard label="RECONCILED" value={Number(summary.reconciled_count ?? 0)} tone="border-emerald-200 bg-white text-emerald-900" href={statusHref("RECONCILED")} /><SummaryCard label="UNSUPPORTED" value={Number(summary.unsupported_source_count ?? summary.unsupported_count ?? 0)} tone="border-red-200 bg-red-50 text-red-900" href={statusHref("UNSUPPORTED_SOURCE")} /><SummaryCard label="MAPPING" value={Number(summary.blocked_by_mapping_count ?? 0)} tone="border-amber-200 bg-amber-50 text-amber-950" href={statusHref("BLOCKED_BY_MAPPING")} /><SummaryCard label="PERIOD" value={Number(summary.blocked_by_period_count ?? 0)} tone="border-amber-200 bg-amber-50 text-amber-950" href={statusHref("BLOCKED_BY_PERIOD")} /><SummaryCard label="NUMBERING" value={Number(summary.blocked_by_numbering_count ?? 0)} tone="border-amber-200 bg-amber-50 text-amber-950" href={statusHref("BLOCKED_BY_NUMBERING")} /><SummaryCard label="APPROVAL" value={Number(summary.blocked_by_approval_count ?? 0)} tone="border-amber-200 bg-amber-50 text-amber-950" href={statusHref("BLOCKED_BY_APPROVAL")} /><SummaryCard label="EXCEPTIONS" value={Number(summary.reconciliation_exception_count ?? summary.exception_count ?? 0)} tone="border-red-200 bg-red-50 text-red-900" /></div>
          <div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active FY</div><div className="font-semibold">{selectedFinancialYear?.code ?? "Missing"}</div></div><div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected period</div><div className="font-semibold">{selectedPeriod?.code ?? "Missing"}</div></div><div className="rounded-xl border border-border bg-background px-3 py-2 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Period status</div><span className={cx("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(selectedPeriod?.status ?? "BLOCKED_BY_PERIOD"))}>{selectedPeriod?.status ?? "BLOCKED_BY_PERIOD"}</span></div></div>
          <div className="mt-4 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">Open period is valid for posting. {readinessBlockers.length ? readinessBlockers.join(" ") : "No selected-context blocker reported."}</div></section>

        <WorkspaceSection title="Filters" description="Filter the operational projection by FY, period, canonical status, event, module, or source."><div className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6"><select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.financial_year ?? ""} onChange={(event) => setDraft("financial_year", event.target.value)}><option value="">Active financial year</option>{availableFinancialYears.map((row) => <option key={row.id ?? row.code} value={String(row.id ?? row.code ?? "")}>{row.code} {row.is_active ? "(active)" : ""}</option>)}</select><select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.accounting_period ?? ""} onChange={(event) => setDraft("accounting_period", event.target.value)}><option value="">Current/open period</option>{availablePeriods.map((row) => <option key={row.id ?? row.code} value={String(row.id ?? row.code ?? "")}>{row.code} · {row.status}</option>)}</select><input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Module" value={draftFilters.module ?? ""} onChange={(event) => setDraft("module", event.target.value)} /><input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Event key" value={draftFilters.event_key ?? ""} onChange={(event) => setDraft("event_key", event.target.value)} /><input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Source model" value={draftFilters.source_model ?? ""} onChange={(event) => setDraft("source_model", event.target.value)} /><select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.status ?? ""} onChange={(event) => setDraft("status", event.target.value)}>{STATUS_OPTIONS.map((option) => <option key={option || "all"} value={option}>{option || "All statuses"}</option>)}</select><div className="flex gap-2 xl:col-span-3"><ActionButton variant="primary" onClick={applyFilters}>Apply</ActionButton><ActionButton variant="secondary" onClick={clearFilters}>Clear</ActionButton></div></div></WorkspaceSection>

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><div className="font-semibold">{selectedCandidateIds.length} selected source item(s)</div><div className="text-xs">Posting creates accounting journal entries. It does not edit original source records.</div></div>
            <div className="flex flex-wrap items-center gap-2">
              <input className="min-w-64 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs" placeholder="Optional posting note" value={postingNote} onChange={(event) => setPostingNote(event.target.value)} />
              <ActionButton variant="secondary" onClick={() => void handleBatchPreview()} disabled={selectedCandidateIds.length === 0 || actionBusy === "batch-preview"}>{actionBusy === "batch-preview" ? "Previewing..." : "Preview selected"}</ActionButton>
              <ActionButton variant="primary" onClick={() => void handleBatchPost()} disabled={!selectedAllPostable || actionBusy === "batch-post"}>{actionBusy === "batch-post" ? "Posting..." : "Post selected"}</ActionButton>
            </div>
          </div>
        </section>

        <WorkspaceSection title="Mapping remediation" description="Supported blockers can create/map accounts or seed safe defaults. StaffAdvance remains non-postable."><div className="grid gap-3 md:grid-cols-3">{(remediation?.rows ?? []).map((row) => <div key={row.event_type} className="rounded-2xl border border-border bg-card p-4 text-sm shadow-sm"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-foreground">{row.required_account_name || row.event_type}</div><div className="font-mono text-xs text-muted-foreground">{row.event_type}</div></div><span className={cx("rounded-full border px-2 py-1 text-xs font-semibold", statusClass(row.status))}>{row.status}</span></div><p className="mt-2 text-xs text-muted-foreground">{row.reason}</p><div className="mt-3 flex flex-wrap gap-2">{row.can_auto_create_account ? <button type="button" onClick={() => void handleCreateAccount(row.event_type)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">Create Account</button> : null}{row.can_map_account ? <button type="button" onClick={() => void handleApplyMapping(row.event_type, row.existing_account_id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">Apply Mapping</button> : null}<Link href={row.action_href || MAPPING_AUDIT_HREF} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground">Open Setup</Link>{!row.is_supported ? <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">Unsupported Source</span> : null}</div></div>)}</div></WorkspaceSection>

        <WorkspaceSection title="Blocked / exception rows" description="Grouped remediation covers missing JournalEntry numbering, locked/closed/missing periods, unsupported sources, approval gates, explicit bridge posting, and reconciliation verification."><div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm"><table className="min-w-full divide-y divide-border text-sm"><thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Reason</th><th className="px-4 py-3 font-semibold">Recommended action</th></tr></thead><tbody className="divide-y divide-border">{exceptionRows.length === 0 ? <tr><td className="px-4 py-6 text-sm text-muted-foreground" colSpan={4}>No blocked or exception rows for the current filters.</td></tr> : exceptionRows.map((row) => <tr key={rowKey(row)}><td className="px-4 py-4"><div className="font-semibold text-foreground">{row.label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div></td><td className="px-4 py-4"><span className={cx("rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(row.status))}>{row.status}</span><div className="mt-1 font-mono text-[11px] text-muted-foreground">{row.period_blocker_code || row.blocker_code}</div></td><td className="px-4 py-4 text-xs text-red-800">{row.period_blocker_reason || row.blocker_reason || row.exception_reasons[0] || remediationByEvent.get(row.event_key)?.reason || "Review required."}</td><td className="px-4 py-4">{rowAction(row)}</td></tr>)}</tbody></table></div></WorkspaceSection>

        <WorkspaceSection title="Source event drilldown" description="Post is enabled only when can_post is true and the controlled posting target exists."><div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm"><table className="min-w-full divide-y divide-border text-sm"><thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">Select</th><th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">Source</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Journal</th><th className="px-4 py-3 font-semibold">Settlement</th><th className="px-4 py-3 font-semibold">Reconciliation</th><th className="px-4 py-3 font-semibold">Admin action</th></tr></thead><tbody className="divide-y divide-border">{rows.length === 0 ? <tr><td className="px-4 py-6 text-sm text-muted-foreground" colSpan={8}>No rows for the current filters.</td></tr> : rows.map((row) => { const candidateId = row.bridge_candidate_id || row.id || ""; return <tr key={rowKey(row)} className="align-top"><td className="px-4 py-4"><input type="checkbox" className="h-4 w-4" disabled={!isConcretePostableCandidate(row)} checked={Boolean(candidateId && selectedCandidateIds.includes(candidateId))} onChange={(event) => toggleCandidate(candidateId, event.target.checked)} aria-label={`Select ${row.source_reference || row.event_key}`} /></td><td className="px-4 py-4"><div className="font-semibold text-foreground">{row.label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div><span className={cx("mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(row.status))}>{row.status}</span></td><td className="px-4 py-4 text-xs text-muted-foreground"><div>{row.source_display || sourceLabel(row)}</div>{row.source_reference ? <div>Ref: {row.source_reference}</div> : null}{row.source_date ? <div>Date: {row.source_date}</div> : null}<div>{row.module}</div></td><td className="px-4 py-4 text-xs font-semibold">{row.amount ?? "-"}</td><td className="px-4 py-4 text-xs">{row.journal_entry?.id ? <Link href={`${ROUTES.admin.accountingJournals}/${row.journal_entry.id}`} className="font-semibold text-primary underline underline-offset-4">{row.journal_entry.entry_no || `Journal #${row.journal_entry.id}`}</Link> : <span className="text-muted-foreground">Not posted</span>}</td><td className="px-4 py-4 text-xs">{row.settlement_linked ? "Linked" : "Not linked"}</td><td className="px-4 py-4 text-xs">{row.reconciliation_linked ? `${row.reconciliation_items.length} item(s)` : "Not linked"}</td><td className="px-4 py-4">{rowAction(row)}</td></tr>; })}</tbody></table></div></WorkspaceSection>

        {preview ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Posting preview</div><h3 className="mt-1 text-lg font-semibold text-foreground">{preview.source.display}</h3><p className="mt-1 text-xs text-muted-foreground">{preview.safety_text}</p></div><button type="button" onClick={() => setPreview(null)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">Close</button></div><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-border p-3 text-sm"><div className="text-xs text-muted-foreground">Journal date</div><div className="font-semibold">{preview.journal_date}</div></div><div className="rounded-xl border border-border p-3 text-sm"><div className="text-xs text-muted-foreground">Number preview</div><div className="font-semibold">{preview.journal_number_preview ?? "Blocked"}</div></div><div className="rounded-xl border border-border p-3 text-sm"><div className="text-xs text-muted-foreground">Balanced</div><div className="font-semibold">{preview.is_balanced ? "Yes" : "No"}</div></div></div><div className="mt-4 grid gap-4 md:grid-cols-2"><div><div className="mb-2 text-sm font-semibold">Debit lines</div>{preview.debit_lines.map((line, index) => <div key={`debit-${index}`} className="rounded-lg border border-border px-3 py-2 text-sm"><div className="font-semibold">{line.chart_account?.code} {line.chart_account?.name}</div><div className="text-xs text-muted-foreground">{line.description}</div><div>{line.debit_amount}</div></div>)}</div><div><div className="mb-2 text-sm font-semibold">Credit lines</div>{preview.credit_lines.map((line, index) => <div key={`credit-${index}`} className="rounded-lg border border-border px-3 py-2 text-sm"><div className="font-semibold">{line.chart_account?.code} {line.chart_account?.name}</div><div className="text-xs text-muted-foreground">{line.description}</div><div>{line.credit_amount}</div></div>)}</div></div>{preview.blockers.length ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{preview.blockers.join(" ")}</div> : null}<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><div className="text-sm font-semibold">Debit {preview.total_debit} · Credit {preview.total_credit}</div><ActionButton variant="primary" onClick={() => void handlePostCandidate(preview.candidate_id, preview.idempotency_key)} disabled={!preview.can_post || actionBusy === `post:${preview.candidate_id}`}>{actionBusy === `post:${preview.candidate_id}` ? "Posting..." : "Post after confirmation"}</ActionButton></div></div></div> : null}
      </div>
    </PortalPage>
  );
}
