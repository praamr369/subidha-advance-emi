"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { ROUTES } from "@/lib/routes";
import {
  getBranchReadiness,
  listBranches,
  listCashCounters,
  type BranchReadiness,
  type BranchRecord,
  type CashCounterRecord,
} from "@/services/branch-control";
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
    slate: "border-border bg-muted/50 text-muted-foreground",
  };
  return `inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${map[tone]}`;
}

export default function BranchesAndDesksWorkbench() {
  const [activeTab, setActiveTab] = useState<"branches" | "desks">("branches");
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
      setError(err instanceof Error ? err.message : "Failed to load branches and desks setup status.");
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

  // -- Branch Math --
  const branchesActive = readiness?.counts.branches_active ?? toNumber(checklist?.counts?.branches_active);
  const primaryConfigured = readiness?.counts.primary_configured ?? Boolean(checklist?.counts?.branches_primary_configured);
  const primaryBranch = readiness?.primary_branch ?? branches.find((row) => row.is_primary) ?? null;
  const activeCounters = readiness?.counts.active_counters ?? counters.length;
  const branchCoverage = readiness?.counts.branches_with_counters ?? new Set(counters.map((counter) => counter.branch)).size;
  const uncoveredBranches = readiness?.uncovered_branches ?? [];

  // -- Desks Math --
  const financeAccounts = toNumber(checklist?.counts?.finance_accounts_active);

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
        title="Branches & Desks Workbench"
        description="Configure your physical operating locations and their associated collection counters (cash desks). This unified view connects operations to accounting."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.admin.branches} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent shadow-sm">Open branch master</Link>
            <Link href={ROUTES.admin.counters} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent shadow-sm">Open counters</Link>
            <button type="button" onClick={() => void loadPage()} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent shadow-sm">Refresh</button>
          </div>
        }
      />
      
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 lg:w-64">
          <BusinessSetupLinks />
        </aside>
        
        <main className="flex-1 min-w-0 space-y-6">
          {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive shadow-sm">{error}</div> : null}

          {/* 3D Tab Navigation */}
          <div className="relative isolate flex p-1.5 w-fit rounded-2xl bg-muted/40 shadow-[inset_0_1px_4px_rgba(0,0,0,0.05)] border border-border/50">
            <button
              type="button"
              onClick={() => setActiveTab("branches")}
              className={`relative z-10 flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-300 ${activeTab === "branches" ? "text-foreground shadow-[0_2px_10px_rgba(0,0,0,0.08)] bg-background ring-1 ring-black/5" : "text-muted-foreground hover:text-foreground hover:bg-background/50"}`}
            >
              Operating Branches
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("desks")}
              className={`relative z-10 flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-300 ${activeTab === "desks" ? "text-foreground shadow-[0_2px_10px_rgba(0,0,0,0.08)] bg-background ring-1 ring-black/5" : "text-muted-foreground hover:text-foreground hover:bg-background/50"}`}
            >
              Cash Desks & Counters
            </button>
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
            {activeTab === "branches" ? (
              <div className="space-y-6">
                <section className="rounded-xl border border-border bg-card p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-foreground">Branch setup readiness</h2>
                      <p className="mt-1.5 text-sm text-muted-foreground">Required for daily shop operations: active primary branch plus at least one active cash counter.</p>
                    </div>
                    <span className={badgeClass(readiness?.status === "READY" ? "green" : loading ? "slate" : "amber")}>{loading ? "LOADING" : readiness?.status || "NEEDS_SETUP"}</span>
                  </div>
                  
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-5 transition hover:bg-muted/40"><div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Active branches</div><div className="mt-3 text-3xl font-bold tracking-tight text-foreground">{loading ? "—" : branchesActive}</div></div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-5 transition hover:bg-muted/40"><div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Primary branch</div><div className="mt-3 text-lg font-bold tracking-tight text-foreground truncate" title={primaryBranch?.name || "Missing"}>{loading ? "—" : primaryBranch?.name || "Missing"}</div></div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-5 transition hover:bg-muted/40"><div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Branch coverage</div><div className="mt-3 text-3xl font-bold tracking-tight text-foreground">{loading ? "—" : branchCoverage}</div></div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-5 transition hover:bg-muted/40"><div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Missing counter coverage</div><div className="mt-3 text-3xl font-bold tracking-tight text-foreground">{loading ? "—" : uncoveredBranches.length}</div></div>
                  </div>

                  {readiness?.blockers?.length ? (
                    <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
                      <div className="font-bold flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-red-600"></div>Blocking setup items</div>
                      <ul className="mt-3 list-disc space-y-1.5 pl-6">{readiness.blockers.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  ) : null}
                  {readiness?.warnings?.length ? (
                    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
                      <div className="font-bold flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-amber-500"></div>Warnings</div>
                      <ul className="mt-3 list-disc space-y-1.5 pl-6">{readiness.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  ) : null}
                  {readiness?.safety_note ? <p className="mt-5 rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground border border-border/50">{readiness.safety_note}</p> : null}
                </section>

                <section className="grid gap-6 md:grid-cols-3">
                  {workflowSteps.map((step) => (
                    <article key={step.label} className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-border/80">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-base font-bold text-foreground">{step.label}</h3>
                          <span className={badgeClass(step.status === "READY" ? "green" : "amber")}>{step.status}</span>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                      </div>
                      <Link href={step.href} className="mt-5 inline-flex w-fit items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-bold text-foreground shadow-sm transition hover:bg-accent group-hover:border-border">Open Settings →</Link>
                    </article>
                  ))}
                </section>

                <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between p-6 border-b border-border/50 bg-muted/10">
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Active branch register</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Exactly one active branch should be marked primary. Use the branch master to create or edit.</p>
                    </div>
                    <Link href={ROUTES.admin.branches} className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent shadow-sm">
                      Open branch master →
                    </Link>
                  </div>
                  <div className="p-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 bg-card">
                    {branches.length === 0 && !loading ? (
                      <div className="col-span-full flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
                        <p className="text-sm text-muted-foreground">No branches configured yet.</p>
                        <Link href={ROUTES.admin.branches} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">Create first branch →</Link>
                      </div>
                    ) : null}
                    {branches.map((branch) => {
                      const branchCounters = counters.filter((c) => c.branch === branch.id);
                      return (
                        <div key={branch.id} className="group relative rounded-2xl border border-border bg-background p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/20">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-lg font-bold text-foreground tracking-tight">{branch.name}</div>
                              <div className="text-xs font-semibold text-muted-foreground mt-0.5 uppercase tracking-wider">{branch.code}</div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                              <span className={badgeClass(branch.status === "ACTIVE" ? "green" : "slate")}>{branch.status}</span>
                              {branch.is_primary ? <span className={badgeClass("blue")}>Primary</span> : null}
                            </div>
                          </div>
                          <div className="mt-4 pt-4 border-t border-border/50 space-y-1.5 text-sm">
                            {branch.phone ? <div className="flex items-center gap-2 text-muted-foreground"><span className="text-xs font-semibold w-14 shrink-0">Phone</span><span>{branch.phone}</span></div> : null}
                            {branch.email ? <div className="flex items-center gap-2 text-muted-foreground"><span className="text-xs font-semibold w-14 shrink-0">Email</span><span className="truncate">{branch.email}</span></div> : null}
                            {branch.address ? <div className="flex items-start gap-2 text-muted-foreground"><span className="text-xs font-semibold w-14 shrink-0 pt-0.5">Address</span><span>{branch.address}</span></div> : null}
                            {!branch.phone && !branch.email && !branch.address ? <p className="text-muted-foreground/60 text-xs">No contact / address saved yet.</p> : null}
                          </div>
                          <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2">
                            <span className={badgeClass(branchCounters.length > 0 ? "green" : "red")}>
                              {branchCounters.length} counter{branchCounters.length !== 1 ? "s" : ""}
                            </span>
                            {branchCounters.map((c) => (
                              <span key={c.id} className="text-xs text-muted-foreground">{c.name}</span>
                            ))}
                            {branchCounters.length === 0 ? <span className="text-xs text-red-700">No counter — cannot collect money</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            ) : (
              <div className="space-y-6">
                <section className="grid gap-6 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-card p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 12h2v5H7zm4-3h2v8h-2zm4-3h2v11h-2z"/></svg></div>
                    <div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Active counters</div>
                    <div className="mt-3 text-4xl font-bold tracking-tight text-foreground">{checklist ? activeCounters : "—"}</div>
                    <div className="mt-3 text-sm text-muted-foreground">Ready for cashier operations.</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg></div>
                    <div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Finance accounts</div>
                    <div className="mt-3 text-4xl font-bold tracking-tight text-foreground">{checklist ? financeAccounts : "—"}</div>
                    <div className="mt-3 text-sm text-muted-foreground">Counters require an active finance mapping.</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-center">
                    <div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Next action</div>
                    <div className="mt-5 flex flex-col gap-3">
                      <Link href="/admin/counters" className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90">
                        Manage Cash Desks
                      </Link>
                      <Link href="/admin/accounting/chart-of-accounts" className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground shadow-sm transition hover:bg-accent">
                        Open Accounting Setup
                      </Link>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between p-6 border-b border-border/50 bg-muted/10">
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Counter register</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Each counter maps one branch to one finance account. Cashiers collect through counters.</p>
                    </div>
                    <Link href={ROUTES.admin.counters} className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent shadow-sm">
                      Manage counters →
                    </Link>
                  </div>
                  {counters.length === 0 && !loading ? (
                    <div className="p-10 flex flex-col items-center gap-3 text-center">
                      <p className="text-sm text-muted-foreground">No active counters yet. Create one after setting up a branch and finance account.</p>
                      <Link href={ROUTES.admin.counters} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">Create first counter →</Link>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30 border-b border-border/50">
                          <tr className="text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            <th className="px-5 py-3">Counter</th>
                            <th className="px-5 py-3">Branch</th>
                            <th className="px-5 py-3">Finance account</th>
                            <th className="px-5 py-3">Assigned to</th>
                            <th className="px-5 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {counters.map((counter) => (
                            <tr key={counter.id} className="bg-background hover:bg-muted/20 transition-colors">
                              <td className="px-5 py-4">
                                <div className="font-semibold text-foreground">{counter.name}</div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">{counter.code}</div>
                              </td>
                              <td className="px-5 py-4 text-muted-foreground">
                                {counter.branch_name || <span className="text-red-600 font-semibold">No branch</span>}
                                {counter.branch_code ? <div className="text-xs uppercase tracking-wider mt-0.5">{counter.branch_code}</div> : null}
                              </td>
                              <td className="px-5 py-4 text-muted-foreground">
                                {counter.finance_account_name || <span className="text-red-600 font-semibold">Not mapped</span>}
                              </td>
                              <td className="px-5 py-4 text-muted-foreground">
                                {counter.assigned_user_username
                                  ? <span className="font-medium text-foreground">{counter.assigned_user_username}</span>
                                  : <span className="text-muted-foreground/60">Unassigned</span>}
                              </td>
                              <td className="px-5 py-4">
                                <span className={badgeClass(counter.is_active ? "green" : "slate")}>
                                  {counter.is_active ? "Active" : "Inactive"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-border/50 bg-muted/10">
                    <h3 className="text-base font-bold text-foreground">Operational rules</h3>
                  </div>
                  <div className="p-5">
                    <ul className="list-disc space-y-2.5 pl-5 text-sm text-muted-foreground leading-relaxed">
                      <li>Use one default counter per branch for day-to-day receipts to keep reconciliation simple.</li>
                      <li>Map each counter to the correct finance account (e.g. Main Cash, HDFC Bank, UPI).</li>
                      <li>Do not expose internal accounting ledger IDs on customer documents — counters should surface friendly names only (e.g. "Cash Desk 1").</li>
                      <li>Counters are what cashiers log into to process collections. A branch without a counter cannot collect money.</li>
                      <li>Unassigned counters can still be used but assigning a staff member improves shift-end reconciliation.</li>
                    </ul>
                  </div>
                </section>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
