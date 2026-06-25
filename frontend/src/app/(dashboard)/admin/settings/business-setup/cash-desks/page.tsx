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

export default function CountersSetupPage() {
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

  const countersActive = toNumber(checklist?.counts?.cash_counters_active);
  const financeAccounts = toNumber(checklist?.counts?.finance_accounts_active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Counters"
        description="Set up collection counters using the existing Branch Control module. Counters connect your branch operations to finance accounts for receipts and collections."
      />
      <BusinessSetupLinks />

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Active counters</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{checklist ? countersActive : "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Finance accounts</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{checklist ? financeAccounts : "—"}</div>
          <div className="mt-2 text-xs text-muted-foreground">Counters require an active finance account.</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Next action</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin/counters" className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              Open Counters
            </Link>
            <Link href="/admin/accounting/chart-of-accounts" className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground">
              Open Accounting Setup
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold text-foreground">Operational notes</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Use one default counter per branch for day-to-day receipts.</li>
          <li>Map each counter to the correct finance account (cash/bank/UPI).</li>
          <li>Do not expose internal accounting IDs on customer documents; counters should surface friendly names only.</li>
        </ul>
      </section>
    </div>
  );
}

