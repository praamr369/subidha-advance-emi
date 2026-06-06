"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banknote, ClipboardCheck, FileText, Home, PackageCheck, ReceiptText, RotateCcw, ShieldCheck, Truck, type LucideIcon } from "lucide-react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { generateCurrentAccountingPeriod } from "@/services/accounting-period-actions";
import { seedSupportedAccountingMappings } from "@/services/accounting-mapping-remediation";
import { getRentLeaseAccountingSummary } from "@/services/rent-lease-accounting-bridge";

const MAPPING_AUDIT_HREF = "/admin/accounting/setup/mapping-audit";

type CockpitCard = { title: string; purpose: string; href: string; icon: LucideIcon; status: "Active" | "Read-only" | "Setup required" | "Deferred" };
type AccountingSummary = Awaited<ReturnType<typeof getRentLeaseAccountingSummary>>;

const workflowCards: CockpitCard[] = [
  { title: "Rent Contracts", purpose: "Create and review rent contracts without exposing Lucky ID or draw workflows.", href: `${ROUTES.admin.subscriptions}?plan_type=RENT`, icon: Home, status: "Active" },
  { title: "Lease Contracts", purpose: "Create and review lease contracts with lease-specific demand and possession controls.", href: `${ROUTES.admin.subscriptions}?plan_type=LEASE`, icon: FileText, status: "Active" },
  { title: "Create Rent", purpose: "Open the existing rent contract creation workflow.", href: ROUTES.admin.subscriptionsRentCreate, icon: ClipboardCheck, status: "Active" },
  { title: "Create Lease", purpose: "Open the existing lease contract creation workflow.", href: ROUTES.admin.subscriptionsLeaseCreate, icon: ClipboardCheck, status: "Active" },
  { title: "Deposit Operations", purpose: "Collect deposits through unified collection and explicitly post deposit liability when mapping is ready.", href: ROUTES.admin.financeDeposits, icon: Banknote, status: "Active" },
  { title: "Unified Collection", purpose: "Collect rent/lease deposits and monthly demands through the existing unified collection route.", href: `${ROUTES.admin.financeCollect}?workflow=unified`, icon: ReceiptText, status: "Active" },
  { title: "Monthly Demands", purpose: "Review rent and lease demand rows through the existing EMI/demand register filters.", href: `${ROUTES.admin.emis}?plan_type=RENT`, icon: ReceiptText, status: "Read-only" },
  { title: "Full Mapping Audit", purpose: "Resolve rent/lease accounting blockers through the central mapping cockpit. No auto-posting.", href: MAPPING_AUDIT_HREF, icon: ShieldCheck, status: "Setup required" },
  { title: "Account Mapping / Deposit Mapping", purpose: "Configure rent/lease mapping for explicit posting bridge readiness. No auto-posting.", href: `${ROUTES.admin.financeDeposits}#accounting-mapping`, icon: ShieldCheck, status: "Setup required" },
  { title: "Possession / Handover", purpose: "Open delivery handoff queues filtered to rent and lease source records.", href: `${ROUTES.admin.deliveries}?plan_type=RENT_LEASE`, icon: Truck, status: "Active" },
  { title: "Return Inspections", purpose: "Review rent/lease returns and inspection queues without creating fake refund actions.", href: `${ROUTES.admin.serviceDeskReturns}?plan_type=RENT_LEASE`, icon: RotateCcw, status: "Read-only" },
  { title: "Delivery Documents", purpose: "Review delivery and handover documents generated from real delivery cases.", href: ROUTES.admin.deliveries, icon: PackageCheck, status: "Read-only" },
];

const STATUS_CLASS: Record<CockpitCard["status"], string> = { Active: "border-emerald-200 bg-emerald-50 text-emerald-800", "Read-only": "border-blue-200 bg-blue-50 text-blue-800", "Setup required": "border-amber-200 bg-amber-50 text-amber-900", Deferred: "border-slate-200 bg-slate-100 text-slate-700" };

function CockpitWorkflowCard({ card }: { card: CockpitCard }) {
  const Icon = card.icon;
  return <article className="flex min-h-[13rem] flex-col rounded-[1.4rem] border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted text-foreground"><Icon className="h-5 w-5" aria-hidden="true" /></div><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_CLASS[card.status]}`}>{card.status}</span></div><div className="mt-4 flex-1 space-y-2"><h2 className="text-base font-semibold text-foreground">{card.title}</h2><p className="text-sm leading-6 text-muted-foreground">{card.purpose}</p></div><div className="mt-4 border-t border-border pt-3"><Link href={card.href} className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground transition hover:bg-muted">Open</Link></div></article>;
}

function valueOf(value: unknown): string { return value === null || value === undefined || value === "" ? "Not exposed" : String(value); }

export default function AdminRentLeaseCockpitPage() {
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSummary() {
    setLoading(true);
    try { setSummary(await getRentLeaseAccountingSummary()); setError(null); } catch (err) { setError(err instanceof Error ? err.message : "Failed to load rent/lease accounting summary."); } finally { setLoading(false); }
  }

  useEffect(() => { void loadSummary(); }, []);

  async function handleGeneratePeriod() {
    setActionBusy("period");
    setNotice(null);
    try { const result = await generateCurrentAccountingPeriod(); setNotice(result.detail || "Current accounting period generated or confirmed."); await loadSummary(); } catch (err) { setError(err instanceof Error ? err.message : "Failed to generate current accounting period."); } finally { setActionBusy(null); }
  }

  async function handleSeedMappings() {
    setActionBusy("seed");
    setNotice(null);
    try { const result = await seedSupportedAccountingMappings(); setNotice(`Rent/lease supported defaults seeded. Journals created: ${result.journal_entries_created}; document numbers allocated: ${result.document_sequences_allocated}.`); await loadSummary(); } catch (err) { setError(err instanceof Error ? err.message : "Failed to seed supported mappings."); } finally { setActionBusy(null); }
  }

  const bridgeStatus = summary?.readiness?.status ?? "Loading";
  const bridgeReady = bridgeStatus === "READY";
  const needsPeriod = bridgeStatus === "NEEDS_ACCOUNTING_PERIOD" || Boolean(summary?.readiness?.accounting_period_readiness?.blockers?.some((reason: string) => reason.toLowerCase().includes("period")));
  const postingMode = summary?.readiness?.posting_mode ?? "Not exposed";
  const postingEnabled = postingMode === "POSTING_ENABLED";
  const postingMessage = summary?.readiness?.message ?? "Source collection is enabled. Posting remains explicit, idempotent, and controlled by backend preview/execute endpoints.";

  return (
    <ERPPageShell eyebrow="Rent / Lease" title="Rent / Lease Cockpit" subtitle="Parent module cockpit for rent and lease contracts, deposits, monthly demands, possession, handover, inspections, returns, documents, and explicit accounting bridge status. Lucky ID and draw workflows stay out of this module." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Rent / Lease" }]} actions={[{ href: ROUTES.admin.subscriptionsRentCreate, label: "Create Rent", variant: "primary" }, { href: ROUTES.admin.subscriptionsLeaseCreate, label: "Create Lease", variant: "secondary" }, { href: MAPPING_AUDIT_HREF, label: "Open Mapping Audit", variant: "secondary" }, { href: `${ROUTES.admin.financeCollect}?workflow=unified`, label: "Unified Collection", variant: "secondary" }]} stats={[{ label: "Demand records", value: valueOf(summary?.demand_records), tone: "info" }, { label: "Mapping readiness", value: bridgeStatus, tone: bridgeReady ? "success" : "warning" }, { label: "Posting mode", value: postingMode, tone: postingEnabled ? "success" : "warning" }, { label: "Lucky IDs", value: "Not used", tone: "success" }]} statusBadge={{ label: bridgeReady ? "Mapping ready" : "Needs remediation", tone: bridgeReady ? "success" : "warning" }}>
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading rent/lease accounting summary..." /> : null}
        {error ? <ERPErrorState title="Unable to load rent/lease summary" description={error} onRetry={() => void loadSummary()} /> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}
        {summary ? <div className={`rounded-[1.25rem] border px-4 py-3 text-sm ${postingEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-950" : bridgeReady ? "border-blue-200 bg-blue-50 text-blue-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Rent/lease accounting mapping: {bridgeStatus}</div>
          <p className="mt-1">{postingMessage}</p>
          <div className="mt-2 text-xs font-semibold uppercase tracking-wide">Posting mode: {postingMode}</div>
          {summary.readiness.accounting_period_readiness?.active_financial_year ? <p className="mt-1 text-xs">Active FY: {summary.readiness.accounting_period_readiness.active_financial_year.code}</p> : null}
          {summary.readiness.accounting_period_readiness?.current_period ? <p className="mt-1 text-xs">Current period: {summary.readiness.accounting_period_readiness.current_period.code} · {summary.readiness.accounting_period_readiness.current_period.status}</p> : null}
          {summary.readiness.operator_action ? <p className="mt-1 text-xs">Action: {summary.readiness.operator_action}</p> : null}
          {summary.readiness.blockers?.length ? <p className="mt-2 font-medium">Blocked reason: {summary.readiness.blockers[0]}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">{needsPeriod ? <button type="button" onClick={() => void handleGeneratePeriod()} disabled={Boolean(actionBusy)} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">{actionBusy === "period" ? "Generating..." : "Generate Current Period"}</button> : null}<button type="button" onClick={() => void handleSeedMappings()} disabled={Boolean(actionBusy)} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">{actionBusy === "seed" ? "Seeding..." : "Seed Rent/Lease Mappings"}</button><Link href={MAPPING_AUDIT_HREF} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">Open Mapping Audit</Link><Link href={ROUTES.admin.accountingPeriods} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">Open Accounting Periods</Link></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-background/70 px-3 py-2">Monthly collected sources: {valueOf(summary.monthly_collected_sources)}</div><div className="rounded-xl border bg-background/70 px-3 py-2">Deposit collected sources: {valueOf(summary.deposit_collected_sources)}</div><div className="rounded-xl border bg-background/70 px-3 py-2">Posted bridge entries: {valueOf(summary.posting_bridge?.posted ?? 0)}</div></div>
        </div> : null}
        <ERPSectionShell title="Rent / lease workflows" description="Detailed child routes live here instead of the admin sidebar. Every card links to an existing route."><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{workflowCards.map((card) => <CockpitWorkflowCard key={card.title} card={card} />)}</div></ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
