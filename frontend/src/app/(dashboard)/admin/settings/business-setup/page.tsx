"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import {
  getSetupChecklist,
  type SetupChecklist,
} from "@/services/business-setup";

type Counts = {
  businessProfileConfigured: boolean;
  branchesActive: number;
  branchesPrimaryConfigured: boolean;
  cashCountersActive: number;
  financeAccountsActive: number;
  chartAccountsActive: number;
  accountingPeriods: number;
  products: number;
  batches: number;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load business setup overview.";
}

const cards = [
  {
    title: "Business Profile",
    description: "Legal identity, contact data, address, and invoice defaults.",
    href: "/admin/settings/business-setup/profile",
    countKey: "businessProfileConfigured" as const,
  },
  {
    title: "Branches",
    description: "Primary branch and operating locations for daily work.",
    href: "/admin/branches",
    countKey: "branchesActive" as const,
  },
  {
    title: "Counters",
    description: "Collection counters mapped to finance accounts.",
    href: "/admin/counters",
    countKey: "cashCountersActive" as const,
  },
  {
    title: "Accounting setup",
    description: "Chart of accounts and finance accounts (cash/bank/UPI).",
    href: "/admin/accounting/chart-of-accounts",
    countKey: "chartAccountsActive" as const,
  },
  {
    title: "Accounting periods",
    description: "Define the current period for reporting and controlled posting.",
    href: "/admin/accounting/periods",
    countKey: "accountingPeriods" as const,
  },
  {
    title: "Products",
    description: "Add at least one product before onboarding customers.",
    href: "/admin/products",
    countKey: "products" as const,
  },
  {
    title: "Checklist",
    description: "Computed readiness status and go-live blocking items.",
    href: "/admin/settings/business-setup/checklist",
    countKey: "batches" as const,
  },
];

export default function BusinessSetupOverviewPage() {
  const [counts, setCounts] = useState<Counts>({
    businessProfileConfigured: false,
    branchesActive: 0,
    branchesPrimaryConfigured: false,
    cashCountersActive: 0,
    financeAccountsActive: 0,
    chartAccountsActive: 0,
    accountingPeriods: 0,
    products: 0,
    batches: 0,
  });
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    try {
      setLoading(true);
      const readiness = await getSetupChecklist();

      setCounts({
        businessProfileConfigured: Boolean(readiness.counts?.business_profile_configured),
        branchesActive: Number(readiness.counts?.branches_active || 0),
        branchesPrimaryConfigured: Boolean(readiness.counts?.branches_primary_configured),
        cashCountersActive: Number(readiness.counts?.cash_counters_active || 0),
        financeAccountsActive: Number(readiness.counts?.finance_accounts_active || 0),
        chartAccountsActive: Number(readiness.counts?.chart_of_accounts_active || 0),
        accountingPeriods: Number(readiness.counts?.accounting_periods || 0),
        products: Number(readiness.counts?.products || 0),
        batches: Number(readiness.counts?.batches || 0),
      });
      setChecklist(readiness);
      setError(null);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business setup"
        description="Configure the operational business masters needed before live collections."
      />
      <BusinessSetupLinks />

      {checklist ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Go-live readiness</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                {checklist.percent_complete}% complete
              </div>
            </div>
            <div
              className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                checklist.is_ready_for_go_live
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-amber-500/10 text-amber-600"
              }`}
            >
              {checklist.is_ready_for_go_live ? "Ready for go-live" : "Setup incomplete"}
            </div>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            href={card.href}
            key={card.title}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
          >
            <div className="text-sm font-medium text-muted-foreground">{card.title}</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {loading
                ? "…"
                : card.countKey === "businessProfileConfigured"
                  ? counts.businessProfileConfigured
                    ? "Configured"
                    : "Missing"
                  : counts[card.countKey]}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{card.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
