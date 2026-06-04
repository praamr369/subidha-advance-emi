"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { getAccountingSetupStatus, repairSuggestedMappings, type AccountingSetupStatusPayload } from "@/services/accounting-setup";
import { getSetupChecklist, type SetupChecklist } from "@/services/business-setup";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function countRows(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export default function AccountingSetupGuidePage() {
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [acctStatus, setAcctStatus] = useState<AccountingSetupStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([getSetupChecklist(), getAccountingSetupStatus()])
      .then(([payload, accounting]) => {
        if (!mounted) return;
        setChecklist(payload);
        setAcctStatus(accounting);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load setup status.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const chartActiveTotal = toNumber(checklist?.counts?.active_chart_accounts ?? checklist?.counts?.chart_of_accounts_active);
  const chartRootsStmt = toNumber(checklist?.counts?.statement_root_accounts ?? checklist?.counts?.visible_register_count);
  const chartChildren = toNumber(checklist?.counts?.child_sub_accounts ?? checklist?.counts?.active_child_chart_accounts);
  const nonStatement = toNumber(checklist?.counts?.non_statement_accounts);
  const blockerCount = toNumber(acctStatus?.setup_health_blockers_count) || countRows(acctStatus?.blocking_reasons);
  const healthWarningCount = toNumber(acctStatus?.setup_health_warnings_count);
  const setupStatus = String(acctStatus?.setup_health_status ?? acctStatus?.status ?? "—");
  const postingReadiness = String(acctStatus?.posting_readiness ?? "BLOCKED");
  const reconciliationReadiness = String(acctStatus?.reconciliation_readiness ?? "BLOCKED");
  const financeAccounts = toNumber(checklist?.counts?.finance_accounts_active);
  const hasCash = toNumber(checklist?.counts?.finance_accounts_cash) > 0;
  const hasBank = toNumber(checklist?.counts?.finance_accounts_bank) > 0;
  const hasUpi = toNumber(checklist?.counts?.finance_accounts_upi) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounting setup"
        description="Configure the chart of accounts and finance accounts using the existing Accounting module. This avoids duplicate finance masters and keeps the EMI ledger separate."
      />
      <BusinessSetupLinks />

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold text-foreground">Live accounting readiness</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Settlement desks must stay separate from ledger-only concepts (income, liabilities, inventory valuation). Detailed
          mappings live under Accounting Setup.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
          <div>
            <div className="text-muted-foreground">Setup engine status</div>
            <div className="font-semibold">{setupStatus}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Posting readiness</div>
            <div className="font-semibold">{postingReadiness}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Reconciliation readiness</div>
            <div className="font-semibold">{reconciliationReadiness}</div>
          </div>
        </div>
        {blockerCount > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {blockerCount} blocker{blockerCount === 1 ? "" : "s"} and {healthWarningCount} warning{healthWarningCount === 1 ? "" : "s"} detected.
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" href="/admin/accounting/setup">
            Open accounting setup
          </a>
          <a className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground" href="/admin/settings/business-setup/chart-accounts">
            Chart accounts checklist
          </a>
          <button
            type="button"
            className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground disabled:opacity-60"
            disabled={repairing}
            onClick={async () => {
              setRepairing(true);
              try {
                await repairSuggestedMappings(false);
                const [payload, accounting] = await Promise.all([getSetupChecklist(), getAccountingSetupStatus()]);
                setChecklist(payload);
                setAcctStatus(accounting);
                setError(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to repair suggested mappings.");
              } finally {
                setRepairing(false);
              }
            }}
          >
            {repairing ? "Repairing..." : "Repair suggested mappings"}
          </button>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Active chart accounts (total)</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{checklist ? chartActiveTotal : "—"}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Statement-type roots (ASSET/LIABILITY/INCOME/EXPENSE): {checklist ? chartRootsStmt : "—"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Total active accounts includes statement roots and operational/control accounts.
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Child / sub chart accounts</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{checklist ? chartChildren : "—"}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Child/sub accounts: {checklist ? chartChildren : "—"} · Non-statement operational/control: {checklist ? nonStatement : "—"}.
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Finance accounts</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{checklist ? financeAccounts : "—"}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Cash {hasCash ? "✓" : "—"} · Bank {hasBank ? "✓" : "—"} · UPI {hasUpi ? "✓" : "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:col-span-3">
          <div className="text-sm font-medium text-muted-foreground">Next action</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin/accounting/chart-of-accounts" className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              Open Chart of Accounts
            </Link>
            <Link href="/admin/accounting/books" className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground">
              Open Books
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold text-foreground">Minimum recommended setup</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Create chart accounts (ASSET/LIABILITY/INCOME/EXPENSE as needed).</li>
          <li>Create at least one finance account for CASH and at least one for BANK or UPI.</li>
          <li>Use finance accounts in counters and billing; do not hardcode raw bank details in receipts.</li>
        </ul>
      </section>
    </div>
  );
}
