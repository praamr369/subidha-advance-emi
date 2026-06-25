"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { getAccountingBooksReadiness, type AccountingBooksReadiness } from "@/services/accounting-books";
import { getAccountingSetupStatus, repairSuggestedMappings, type AccountingSetupStatusPayload } from "@/services/accounting-setup";
import { getSetupChecklist, type SetupChecklist } from "@/services/business-setup";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function countRows(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function badgeClass(tone: "green" | "amber" | "red" | "blue" | "slate") {
  const map = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-border bg-muted/50 text-muted-foreground",
  };
  return `inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${map[tone]}`;
}

export default function AccountingSetupGuidePage() {
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [acctStatus, setAcctStatus] = useState<AccountingSetupStatusPayload | null>(null);
  const [booksReadiness, setBooksReadiness] = useState<AccountingBooksReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadPage() {
    try {
      setLoading(true);
      const [payload, accounting, books] = await Promise.all([getSetupChecklist(), getAccountingSetupStatus(), getAccountingBooksReadiness()]);
      setChecklist(payload);
      setAcctStatus(accounting);
      setBooksReadiness(books);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load setup status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const chartActiveTotal = toNumber(checklist?.counts?.active_chart_accounts ?? checklist?.counts?.chart_of_accounts_active);
  const chartRootsStmt = toNumber(checklist?.counts?.statement_root_accounts ?? checklist?.counts?.visible_register_count);
  const chartChildren = toNumber(checklist?.counts?.child_sub_accounts ?? checklist?.counts?.active_child_chart_accounts);
  const nonStatement = toNumber(checklist?.counts?.non_statement_accounts);
  const blockerCount = toNumber(acctStatus?.setup_health_blockers_count) || countRows(acctStatus?.blocking_reasons) || (booksReadiness?.blockers.length ?? 0);
  const healthWarningCount = toNumber(acctStatus?.setup_health_warnings_count) + (booksReadiness?.warnings.length ?? 0);
  const setupStatus = String(acctStatus?.setup_health_status ?? acctStatus?.status ?? (booksReadiness?.status || "—"));
  const postingReadiness = String(acctStatus?.posting_readiness ?? "BLOCKED");
  const reconciliationReadiness = String(acctStatus?.reconciliation_readiness ?? "BLOCKED");
  const financeAccounts = booksReadiness?.counts.active_finance_accounts ?? toNumber(checklist?.counts?.finance_accounts_active);
  const hasCash = (booksReadiness?.counts.cash_accounts ?? toNumber(checklist?.counts?.finance_accounts_cash)) > 0;
  const hasBank = (booksReadiness?.counts.bank_accounts ?? toNumber(checklist?.counts?.finance_accounts_bank)) > 0;
  const hasUpi = (booksReadiness?.counts.upi_accounts ?? toNumber(checklist?.counts?.finance_accounts_upi)) > 0;
  const movementEligible = booksReadiness?.counts.movement_eligible_accounts ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Accounting setup" description="Configure chart accounts and finance accounts using existing Accounting masters. Finance accounts are real cash/bank/UPI settlement instruments; posting profiles remain separate." />
      <BusinessSetupLinks />

      {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="text-base font-semibold text-foreground">Live accounting readiness</div><p className="mt-2 text-sm text-muted-foreground">Settlement desks stay separate from ledger-only concepts. Use Books only for real inter-account transfers; use Bridge Reconciliation for system-generated source posting.</p></div>
          <span className={badgeClass(blockerCount > 0 ? "amber" : "green")}>{loading ? "LOADING" : setupStatus}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
          <div><div className="text-muted-foreground">Setup engine status</div><div className="font-semibold">{setupStatus}</div></div>
          <div><div className="text-muted-foreground">Posting readiness</div><div className="font-semibold">{postingReadiness}</div></div>
          <div><div className="text-muted-foreground">Reconciliation readiness</div><div className="font-semibold">{reconciliationReadiness}</div></div>
        </div>
        {blockerCount > 0 || healthWarningCount > 0 ? <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{blockerCount} blocker{blockerCount === 1 ? "" : "s"} and {healthWarningCount} warning{healthWarningCount === 1 ? "" : "s"} detected.</div> : null}
        {booksReadiness?.blockers?.length ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"><div className="font-semibold">Books blockers</div><ul className="mt-2 list-disc space-y-1 pl-5">{booksReadiness.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        {booksReadiness?.warnings?.length ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><div className="font-semibold">Finance account warnings</div><ul className="mt-2 list-disc space-y-1 pl-5">{booksReadiness.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" href="/admin/accounting/setup">Open accounting setup</Link>
          <Link className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground" href="/admin/settings/business-setup/chart-accounts">Chart accounts checklist</Link>
          <Link className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground" href="/admin/accounting/books">Open books</Link>
          <button type="button" className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground disabled:opacity-60" disabled={repairing} onClick={async () => { setRepairing(true); try { await repairSuggestedMappings(false); await loadPage(); } catch (err) { setError(err instanceof Error ? err.message : "Failed to repair suggested mappings."); } finally { setRepairing(false); } }}>{repairing ? "Repairing..." : "Repair suggested mappings"}</button>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm"><div className="text-sm font-medium text-muted-foreground">Active chart accounts</div><div className="mt-2 text-3xl font-semibold text-foreground">{checklist ? chartActiveTotal : "—"}</div><div className="mt-2 text-xs text-muted-foreground">Statement roots: {checklist ? chartRootsStmt : "—"}</div></div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm"><div className="text-sm font-medium text-muted-foreground">Child / sub accounts</div><div className="mt-2 text-3xl font-semibold text-foreground">{checklist ? chartChildren : "—"}</div><div className="mt-2 text-xs text-muted-foreground">Non-statement operational/control: {checklist ? nonStatement : "—"}</div></div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm"><div className="text-sm font-medium text-muted-foreground">Finance accounts</div><div className="mt-2 text-3xl font-semibold text-foreground">{loading ? "—" : financeAccounts}</div><div className="mt-2 text-xs text-muted-foreground">Cash {hasCash ? "✓" : "—"} · Bank {hasBank ? "✓" : "—"} · UPI {hasUpi ? "✓" : "—"}</div></div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm"><div className="text-sm font-medium text-muted-foreground">Movement eligible</div><div className="mt-2 text-3xl font-semibold text-foreground">{loading ? "—" : movementEligible}</div><div className="mt-2 text-xs text-muted-foreground">Requires real active settlement accounts mapped to posting-ready ASSET ledgers.</div></div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold text-foreground">Finance account register</div>
        <p className="mt-1 text-sm text-muted-foreground">This is a setup summary. Edit/create finance accounts in Accounting Setup; use Books only for inter-account transfers.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(booksReadiness?.finance_accounts ?? []).map((account) => (
            <div key={account.id} className="rounded-xl border border-border bg-background p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><strong>{account.name}</strong><div className="mt-1 text-xs text-muted-foreground">{account.kind} · {account.chart_account_code || "No chart"} · {account.branch_code || "Default branch"}</div></div><div className="flex flex-wrap gap-2"><span className={badgeClass(account.collection_ready ? "green" : "amber")}>{account.collection_ready ? "Collection ready" : "Collection review"}</span><span className={badgeClass(account.movement_eligible ? "green" : "amber")}>{account.movement_eligible ? "Books ready" : "Books review"}</span></div></div>
              {account.collection_blocker_reason ? <div className="mt-2 text-xs text-amber-900">{account.collection_blocker_reason}</div> : null}
            </div>
          ))}
          {!loading && (booksReadiness?.finance_accounts ?? []).length === 0 ? <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No active settlement finance account exposed by backend readiness.</div> : null}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold text-foreground">Minimum recommended setup</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Create chart accounts first; finance accounts must map to active ASSET accounts.</li>
          <li>Create at least one CASH account and at least one BANK or UPI account.</li>
          <li>Use finance accounts in counters, billing, receipts, books, and reconciliation; do not hardcode bank details in receipts.</li>
          <li>Use Accounting Bridge Reconciliation for source posting. Books is only for explicit inter-account movement.</li>
        </ul>
      </section>
    </div>
  );
}
