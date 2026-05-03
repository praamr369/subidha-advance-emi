"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { getAccountingSetupStatus } from "@/services/accounting-setup";
import { getSetupChecklist, type SetupChecklist } from "@/services/business-setup";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function AccountingSetupGuidePage() {
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [acctStatus, setAcctStatus] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([getSetupChecklist(), getAccountingSetupStatus()])
      .then(([payload, accounting]) => {
        if (!mounted) return;
        setChecklist(payload);
        setAcctStatus(accounting as Record<string, unknown>);
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

  const chartAccounts = toNumber(checklist?.counts?.chart_of_accounts_active);
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
            <div className="font-semibold">{acctStatus ? String(acctStatus.status ?? "—") : "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Mappings complete</div>
            <div className="font-semibold">{acctStatus?.mappings_complete ? "Yes" : "No"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Warnings</div>
            <div className="font-semibold">{acctStatus ? String(acctStatus.warnings_count ?? 0) : "—"}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" href="/admin/accounting/setup">
            Open accounting setup
          </a>
          <a className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground" href="/admin/settings/business-setup/chart-accounts">
            Chart accounts checklist
          </a>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Chart accounts</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{checklist ? chartAccounts : "—"}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Finance accounts</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{checklist ? financeAccounts : "—"}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Cash {hasCash ? "✓" : "—"} · Bank {hasBank ? "✓" : "—"} · UPI {hasUpi ? "✓" : "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
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
