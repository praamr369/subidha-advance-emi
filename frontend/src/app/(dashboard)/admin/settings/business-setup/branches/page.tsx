"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { ROUTES } from "@/lib/routes";
import { getBranchReadiness, listBranches, listCashCounters, type BranchReadiness, type BranchRecord, type CashCounterRecord } from "@/services/branch-control";
import { getSetupChecklist, type SetupChecklist } from "@/services/business-setup";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function badgeClass(tone: "green" | "amber" | "red" | "blue" | "slate") {
  const map = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-slate-200 bg-slate-50 text-muted-foreground",
  };
  return `inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${map[tone]}`;
}

export default function BranchesSetupPage() {
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [readiness, setReadiness] = useState<BranchReadiness | null>(null);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [counters, setCounters] = useState<CashCounterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    try {
      setLoading(true);
      const [checklistPayload, readinessPayload, branchPayload, counterPayload] = await Promise.all([
        getSetupChecklist(),
        getBranchReadiness(),
        listBranches(),
        listCashCounters({ is_active: "true" }),
      ]);
      setChecklist(checklistPayload);
      setReadiness(readinessPayload);
      setBranches(branchPayload.results);
      setCounters(counterPayload.results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load branch setup status.");
      setReadiness(null);
      setBranches([]);
      setCounters([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const branchesActive = readiness?.counts.branches_active ?? toNumber(checklist?.counts?.branches_active);
  const primaryConfigured = readiness?.counts.primary_configured ?? Boolean(checklist?.counts?.branches_primary_configured);
  const primaryBranch = readiness?.primary_branch ?? branches.find((row) => row.is_primary) ?? null;
  const activeCounters = readiness?.counts.active_counters ?? counters.length;
  const branchCoverage = readiness?.counts.branches_with_counters ?? new Set(counters.map((counter) => counter.branch)).size;
  const uncoveredBranches = readiness?.uncovered_branches ?? [];

  const workflowSteps = useMemo(
    () => [
      {
        label: "Primary branch",
        status: primaryConfigured ? "READY" : "NEEDS_SETUP",
        detail: primaryConfigured ? `${primaryBranch?.code || "Primary"} is configured.` : "Create or edit one active branch and mark it primary.",
        href: ROUTES.admin.branches,
      },
      {
        label: "Collection counter",
        status: activeCounters > 0 ? "READY" : "NEEDS_SETUP",
        detail: activeCounters > 0 ? `${activeCounters} active counter(s) can collect money.` : "Create at least one active counter after finance-account setup.",
        href: ROUTES.admin.counters,
      },
      {
        label: "Branch finance trace",
        status: branchCoverage > 0 ? "READY" : "NEEDS_SETUP",
        detail: branchCoverage > 0 ? `${branchCoverage} active branch(es) have counter coverage.` : "Map counter to branch and finance account before cashier rollout.",
        href: ROUTES.admin.counters,
      },
    ],
    [activeCounters, branchCoverage, primaryBranch?.code, primaryConfigured],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        description="Set up the primary branch, operating locations, and collection counter coverage. This page reads the existing Branch Control module; it does not create duplicate master data."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.admin.branches} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent">Open branch master</Link>
            <Link href={ROUTES.admin.counters} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent">Open counters</Link>
            <button type="button" onClick={() => void loadPage()} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent">Refresh</button>
          </div>
        }
      />
      <BusinessSetupLinks />

      {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Branch setup readiness</h2>
            <p className="mt-1 text-sm text-muted-foreground">Required for daily shop operations: active primary branch plus at least one active cash counter.</p>
          </div>
          <span className={badgeClass(readiness?.status === "READY" ? "green" : loading ? "slate" : "amber")}>{loading ? "LOADING" : readiness?.status || "NEEDS_SETUP"}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-border bg-background p-4"><div className="text-xs font-semibold uppercase text-muted-foreground">Active branches</div><div className="mt-2 text-2xl font-semibold text-foreground">{loading ? "—" : branchesActive}</div></div>
          <div className="rounded-xl border border-border bg-background p-4"><div className="text-xs font-semibold uppercase text-muted-foreground">Primary branch</div><div className="mt-2 text-sm font-semibold text-foreground">{loading ? "—" : primaryBranch?.name || "Missing"}</div></div>
          <div className="rounded-xl border border-border bg-background p-4"><div className="text-xs font-semibold uppercase text-muted-foreground">Active counters</div><div className="mt-2 text-2xl font-semibold text-foreground">{loading ? "—" : activeCounters}</div></div>
          <div className="rounded-xl border border-border bg-background p-4"><div className="text-xs font-semibold uppercase text-muted-foreground">Branch coverage</div><div className="mt-2 text-2xl font-semibold text-foreground">{loading ? "—" : branchCoverage}</div></div>
          <div className="rounded-xl border border-border bg-background p-4"><div className="text-xs font-semibold uppercase text-muted-foreground">Missing counter coverage</div><div className="mt-2 text-2xl font-semibold text-foreground">{loading ? "—" : uncoveredBranches.length}</div></div>
        </div>
        {readiness?.blockers?.length ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <div className="font-semibold">Blocking setup items</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">{readiness.blockers.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null}
        {readiness?.warnings?.length ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">Warnings</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">{readiness.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null}
        {readiness?.safety_note ? <p className="mt-4 text-sm text-muted-foreground">{readiness.safety_note}</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {workflowSteps.map((step) => (
          <article key={step.label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{step.label}</h3>
              <span className={badgeClass(step.status === "READY" ? "green" : "amber")}>{step.status}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{step.detail}</p>
            <Link href={step.href} className="mt-4 inline-flex rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent">Open</Link>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="text-base font-semibold text-foreground">Active branch register</div>
          <p className="mt-1 text-sm text-muted-foreground">Use /admin/branches to create or edit. Exactly one active branch should be primary.</p>
          <div className="mt-4 space-y-2">
            {branches.length === 0 && !loading ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No branch rows returned.</p> : null}
            {branches.map((branch) => (
              <div key={branch.id} className="rounded-xl border border-border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><strong>{branch.code}</strong> · {branch.name}</div>
                  <div className="flex gap-2"><span className={badgeClass(branch.status === "ACTIVE" ? "green" : "slate")}>{branch.status}</span>{branch.is_primary ? <span className={badgeClass("blue")}>Primary</span> : null}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{branch.address || branch.phone || branch.email || "No contact/address metadata yet."}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="text-base font-semibold text-foreground">What this unlocks</div>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Cashier and counter collection scope.</li>
            <li>Branch-aware receipts, day-close, and finance-account traceability.</li>
            <li>Future showroom/warehouse/rent-leasing branch expansion without changing old EMI contracts.</li>
            <li>Branch reporting for collections, direct sale, subscriptions, stock, and people costs.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={ROUTES.admin.branchReporting} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-accent">Open branch reporting</Link>
            <Link href={ROUTES.admin.setupReadiness} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-accent">Open setup readiness</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
