"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import {
  getBusinessProfile,
  getSetupChecklist,
  listBranches,
  listCashDesks,
  listChartAccounts,
  listFinanceAccounts,
  listStaffAssignments,
  type SetupChecklist,
} from "@/services/business-setup";

type Counts = {
  profileConfigured: boolean;
  branches: number;
  financeAccounts: number;
  cashDesks: number;
  staffAssignments: number;
  chartAccounts: number;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load business setup overview.";
}

const cards = [
  {
    title: "Business Profile",
    description: "Legal identity, contact data, address, and invoice defaults.",
    href: "/admin/settings/business-setup/profile",
    countKey: "profileConfigured" as const,
  },
  {
    title: "Branches",
    description: "Operating location master for head office and collection points.",
    href: "/admin/settings/business-setup/branches",
    countKey: "branches" as const,
  },
  {
    title: "Finance Accounts",
    description: "Operational cash, bank, and UPI account masters.",
    href: "/admin/settings/business-setup/finance-accounts",
    countKey: "financeAccounts" as const,
  },
  {
    title: "Cash Desks",
    description: "Branch-level collection desks mapped to operational finance accounts.",
    href: "/admin/settings/business-setup/cash-desks",
    countKey: "cashDesks" as const,
  },
  {
    title: "Staff Setup",
    description: "Operational assignment layer for admin, cashier, and finance control.",
    href: "/admin/settings/business-setup/staff",
    countKey: "staffAssignments" as const,
  },
  {
    title: "Chart Accounts",
    description: "Accounting classification master, kept separate from finance accounts.",
    href: "/admin/settings/business-setup/chart-accounts",
    countKey: "chartAccounts" as const,
  },
  {
    title: "Checklist",
    description: "Computed readiness status and go-live blocking items.",
    href: "/admin/settings/business-setup/checklist",
    countKey: "branches" as const,
  },
];

export default function BusinessSetupOverviewPage() {
  const [counts, setCounts] = useState<Counts>({
    profileConfigured: false,
    branches: 0,
    financeAccounts: 0,
    cashDesks: 0,
    staffAssignments: 0,
    chartAccounts: 0,
  });
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    try {
      setLoading(true);
      const [
        profile,
        branches,
        financeAccounts,
        cashDesks,
        staffAssignments,
        chartAccounts,
        readiness,
      ] = await Promise.all([
        getBusinessProfile(),
        listBranches(),
        listFinanceAccounts(),
        listCashDesks(),
        listStaffAssignments(),
        listChartAccounts(),
        getSetupChecklist(),
      ]);

      setCounts({
        profileConfigured: Boolean(profile),
        branches: branches.length,
        financeAccounts: financeAccounts.length,
        cashDesks: cashDesks.length,
        staffAssignments: staffAssignments.length,
        chartAccounts: chartAccounts.length,
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
                : card.countKey === "profileConfigured"
                  ? counts.profileConfigured
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
