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
  fixAccountingMappingAuditEvent,
  getAccountingMappingAudit,
  seedAccountingMappingSafeDefaults,
  validateAccountingMappingAudit,
  type AccountingMappingAuditPayload,
  type AccountingMappingAuditRow,
} from "@/services/accounting-mapping-audit";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusClass(status: string): string {
  const value = status.toUpperCase();
  if (value === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (value.includes("UNSUPPORTED") || value.includes("CONFLICT") || value.includes("ERROR")) return "border-red-200 bg-red-50 text-red-900";
  if (value.includes("BLOCKED") || value.includes("MISSING") || value.includes("INACTIVE")) return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-900";
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return <div className={cx("rounded-2xl border p-4 shadow-sm", tone)}><div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
}

function MappingStatus({ value }: { value: string }) {
  return <span className={cx("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusClass(value))}>{value}</span>;
}

export default function AccountingMappingAuditPage() {
  const [payload, setPayload] = useState<AccountingMappingAuditPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setPayload(await getAccountingMappingAudit());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounting mapping audit.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function seedDefaults() {
    setBusy("seed");
    setNotice(null);
    try {
      const result = await seedAccountingMappingSafeDefaults();
      setPayload(result.after);
      setNotice(`Safe defaults seeded. Journals created: ${result.journal_entries_created}; document numbers allocated: ${result.document_sequences_allocated}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed safe defaults.");
    } finally {
      setBusy(null);
    }
  }

  async function validateAll() {
    setBusy("validate");
    setNotice(null);
    try {
      setPayload(await validateAccountingMappingAudit());
      setNotice("Validation completed. No source records, journals, receipts, payments, or document numbers were created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate mapping audit.");
    } finally {
      setBusy(null);
    }
  }

  async function fixEvent(row: AccountingMappingAuditRow) {
    setBusy(row.event_key);
    setNotice(null);
    try {
      const action = row.status === "INACTIVE_MAPPING" ? "reactivate_mapping" : row.can_apply_mapping ? "apply_mapping" : "create_account";
      const result = await fixAccountingMappingAuditEvent({ event_key: row.event_key, action });
      setPayload(result.audit);
      setNotice(`${row.event_label} remediation evaluated. No posting was created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fix mapping event.");
    } finally {
      setBusy(null);
    }
  }

  const rows = payload?.events ?? [];
  const unsupported = payload?.unsupported_events ?? [];
  const conflicts = payload?.conflicts ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, AccountingMappingAuditRow[]>();
    for (const row of rows) map.set(row.module, [...(map.get(row.module) ?? []), row]);
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  if (loading) return <PortalPage title="Accounting Mapping Cockpit" subtitle="Full setup verification for accounting mappings."><LoadingBlock label="Loading mapping audit..." /></PortalPage>;

  const summary = payload?.summary ?? { total_events: 0, ready: 0, missing_mapping: 0, conflicts: 0, unsupported: 0, blocked_by_period: 0, blocked_by_numbering: 0 };
  const period = payload?.period_readiness ?? {};

  return (
    <PortalPage
      title="Accounting Mapping Cockpit"
      subtitle="Verify every supported accounting event, seed safe setup defaults, and keep unsupported workflows clearly non-postable."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Setup", href: ROUTES.admin.accountingSetup }, { label: "Mapping Audit" }]}
      actions={[{ href: ROUTES.admin.accountingSetup, label: "Accounting Setup", variant: "secondary" }, { href: ROUTES.admin.accountingBridges, label: "Bridge Readiness", variant: "secondary" }, { href: ROUTES.admin.accountingPeriods, label: "Periods", variant: "secondary" }]}
      statusBadge={{ label: payload?.year_end_impact === "READY" ? "Year-End Ready" : "Year-End Blocked", tone: payload?.year_end_impact === "READY" ? "success" : "warning" }}
    >
      <div className="space-y-6">
        {error ? <ErrorState title="Mapping audit failed" description={error} onRetry={() => void load()} /> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full accounting mapping verification</div>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Bridge impact: {payload?.bridge_impact ?? "Not loaded"}</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Setup actions create only setup metadata such as Chart of Accounts, Finance Accounts, mappings, and posting profiles. They do not create JournalEntry, Payment, Receipt, ReconciliationItem, or document numbers.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="primary" onClick={() => void seedDefaults()} disabled={Boolean(busy)}>{busy === "seed" ? "Seeding..." : "Seed Safe Defaults"}</ActionButton>
              <ActionButton variant="secondary" onClick={() => void validateAll()} disabled={Boolean(busy)}>{busy === "validate" ? "Validating..." : "Validate All"}</ActionButton>
              <ActionButton variant="ghost" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</ActionButton>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <SummaryCard label="Total events" value={summary.total_events} tone="border-slate-200 bg-slate-50 text-slate-900" />
            <SummaryCard label="Ready" value={summary.ready} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
            <SummaryCard label="Missing" value={summary.missing_mapping} tone="border-amber-200 bg-amber-50 text-amber-950" />
            <SummaryCard label="Conflicts" value={summary.conflicts} tone="border-red-200 bg-red-50 text-red-900" />
            <SummaryCard label="Unsupported" value={summary.unsupported} tone="border-slate-200 bg-slate-50 text-slate-900" />
            <SummaryCard label="Period blocked" value={summary.blocked_by_period} tone="border-amber-200 bg-amber-50 text-amber-950" />
            <SummaryCard label="Numbering blocked" value={summary.blocked_by_numbering} tone="border-amber-200 bg-amber-50 text-amber-950" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Link href={ROUTES.admin.accountingFinanceAccounts} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">Open Finance Accounts</Link>
            <Link href={ROUTES.admin.accountingChartOfAccounts} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">Open COA</Link>
            <Link href={ROUTES.admin.settingsBusinessSetupDocumentNumbering} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">Open Document Numbering</Link>
            <Link href={ROUTES.admin.accountingPeriods} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">Open Periods</Link>
          </div>
          <div className="mt-4 rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">Active FY: {String((period.active_financial_year as { code?: string } | undefined)?.code ?? "Missing")} · Current period: {String((period.current_period as { code?: string } | undefined)?.code ?? "Missing")}</div>
        </section>

        <WorkspaceSection title="Conflict panel" description="Wrong type, duplicate active mapping, inactive account/mapping, and source-support issues are blocked from posting.">
          <div className="grid gap-3 md:grid-cols-2">
            {(conflicts.length ? conflicts : payload?.setup_blockers.slice(0, 6) ?? []).map((row) => <div key={`conflict-${row.event_key}`} className="rounded-2xl border border-border bg-card p-4 text-sm shadow-sm"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-foreground">{row.event_label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div></div><MappingStatus value={row.status} /></div><p className="mt-2 text-xs text-muted-foreground">{row.blocker_reason || row.recommended_action}</p><Link href={row.setup_href || ROUTES.admin.accountingSetup} className="mt-3 inline-flex rounded-lg border border-border px-3 py-2 text-xs font-semibold">Open setup</Link></div>)}
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Unsupported workflow panel" description="Future workflows remain visible without fake readiness or post buttons.">
          <div className="grid gap-3 md:grid-cols-2">
            {unsupported.map((row) => <div key={`unsupported-${row.event_key}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800"><div className="font-semibold">{row.event_label}</div><div className="mt-1 font-mono text-xs">{row.event_key}</div><p className="mt-2 text-xs">{row.recommended_action || row.blocker_reason}</p><div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">No Post button available</div></div>)}
          </div>
        </WorkspaceSection>

        {grouped.map(([module, moduleRows]) => (
          <WorkspaceSection key={module} title={`${module} event matrix`} description="Canonical status from mapping audit. Use setup actions only; posting remains outside this cockpit.">
            <div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Debit</th><th className="px-4 py-3">Credit</th><th className="px-4 py-3">Finance</th><th className="px-4 py-3">Numbering</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {moduleRows.map((row) => <tr key={row.event_key} className="align-top"><td className="px-4 py-4"><div className="font-semibold text-foreground">{row.event_label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div></td><td className="px-4 py-4 text-xs text-muted-foreground">{row.source_model}</td><td className="px-4 py-4"><MappingStatus value={row.debit_mapping_status} /></td><td className="px-4 py-4"><MappingStatus value={row.credit_mapping_status} /></td><td className="px-4 py-4"><MappingStatus value={row.finance_account_status} /></td><td className="px-4 py-4"><MappingStatus value={row.numbering_readiness} /></td><td className="px-4 py-4"><MappingStatus value={row.period_readiness} /></td><td className="px-4 py-4"><MappingStatus value={row.status} /></td><td className="px-4 py-4 text-xs"><div className="flex flex-col gap-2">{row.supported && row.status !== "READY" ? <button type="button" disabled={busy === row.event_key} onClick={() => void fixEvent(row)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left font-semibold text-amber-950">{busy === row.event_key ? "Fixing..." : "Fix Event"}</button> : null}<Link href={row.setup_href || ROUTES.admin.accountingSetup} className="rounded-lg border border-border px-3 py-2 font-semibold">Open setup</Link><span className="text-muted-foreground">{row.recommended_action}</span></div></td></tr>)}
                </tbody>
              </table>
            </div>
          </WorkspaceSection>
        ))}
      </div>
    </PortalPage>
  );
}
