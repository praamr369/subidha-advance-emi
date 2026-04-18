"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { getSetupChecklist, type SetupChecklist } from "@/services/business-setup";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ChartAccountsSetupGuidePage() {
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getSetupChecklist()
      .then((payload) => {
        if (!mounted) return;
        setChecklist(payload);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chart accounts"
        description="Chart accounts live under the Accounting module. This setup page is a guide so the first-run flow does not duplicate accounting masters."
      />
      <BusinessSetupLinks />

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Active chart accounts</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{checklist ? chartAccounts : "—"}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:col-span-2">
          <div className="text-sm font-medium text-muted-foreground">Next action</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin/accounting/chart-of-accounts" className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              Open Chart of Accounts
            </Link>
            <Link href="/admin/accounting/books" className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground">
              Open Books
            </Link>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            Configure chart accounts first, then finance accounts (cash/bank/UPI). This keeps your ledger auditable and avoids mixing EMI payment history with accounting postings.
          </div>
        </div>
      </section>
    </div>
  );
}

