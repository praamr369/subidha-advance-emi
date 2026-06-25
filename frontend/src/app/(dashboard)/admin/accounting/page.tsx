"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  BookOpenText,
  Building2,
  Calendar,
  ClipboardCheck,
  FileBarChart,
  FileText,
  HandCoins,
  Landmark,
  PackageSearch,
  Receipt,
  ReceiptText,
  RefreshCw,
  Repeat2,
  Scale,
  ScrollText,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { listChartOfAccounts, listFinanceAccounts, listJournalEntries } from "@/services/accounting";
import { getAccountingBridgeReadiness, type AccountingBridgeReadinessEvent, type AccountingBridgeReadinessPayload } from "@/services/accounting-bridge-readiness";
import {
  getAccountingSetupReadiness,
  getAccountingSetupStatus,
  type AccountingSetupReadinessPayload,
  type AccountingSetupStatusPayload,
} from "@/services/accounting-setup";
import { getAdminAccountingControlCenter } from "@/services/phase5-control";
import { getAccountingReadiness, type AccountingReadiness } from "@/services/rent-lease-accounting-bridge";

type ModuleStatus = "READY" | "BLOCKED" | "PARTIAL" | "DEFERRED";

type AccountingModuleDefinition = {
  key: string;
  title: string;
  description: string;
  route: string | null;
  icon: LucideIcon;
  implemented: boolean;
  readOnly?: boolean;
  setupGate?: boolean;
  defaultStatus?: ModuleStatus;
  deferredReason?: string;
};

type AccountingModuleGroup = {
  title: string;
  description: string;
  modules: AccountingModuleDefinition[];
};

type AccountingControlPayload = {
  kpis?: Record<string, string>;
  modules?: unknown[];
  capabilities?: unknown[];
};

type CockpitData = {
  chartAccountsCount: number | null;
  financeAccountsCount: number | null;
  draftJournalsCount: number | null;
  postedMovementsCount: number | null;
  setupStatus: AccountingSetupStatusPayload | null;
  setupReadiness: AccountingSetupReadinessPayload | null;
  bridgeReadiness: AccountingBridgeReadinessPayload | null;
  accountingReadiness: AccountingReadiness | null;
  controlPayload: AccountingControlPayload | null;
};

type ActionItem = {
  label: string;
  detail: string;
  href: string;
  blocked: boolean;
};

const MODULE_GROUPS: AccountingModuleGroup[] = [
  {
    title: "Setup & Master Data",
    description: "Accounts, finance accounts, setup gates, and readiness before staff handle live money.",
    modules: [
      { key: "chart_accounts", title: "Chart of Accounts", description: "Maintain the account structure used by journals, reports, and posting profiles.", route: ROUTES.admin.accountingChartOfAccounts, icon: BookOpenText, implemented: true },
      { key: "finance_accounts", title: "Finance Accounts", description: "Manage cash, bank, UPI, and payment gateway settlement accounts separately from COA structure.", route: ROUTES.admin.accountingFinanceAccounts, icon: Landmark, implemented: true, setupGate: true },
      { key: "accounting_setup", title: "Accounting Setup", description: "Fix account mappings and setup blockers before live money operations.", route: ROUTES.admin.accountingSetup, icon: Settings2, implemented: true, setupGate: true },
      { key: "setup_readiness", title: "Setup Readiness", description: "Read-only readiness center for business setup, collection gates, and document controls.", route: ROUTES.admin.setupReadiness, icon: ShieldCheck, implemented: true, readOnly: true },
    ],
  },
  {
    // Phase 4: These are Finance Operations source feeds that accounting observes.
    // The collection, advance, deposit, and receivable OPERATIONS happen in Finance Operations
    // (/admin/finance/*). Accounting sees them through bridge candidates after they are recorded.
    // Accounting pages must not present source collection/deposit/refund as if it happens inside accounting.
    title: "Finance Operations feeds into accounting",
    description: "Finance source workflow records that flow into the accounting bridge. The operational recording of collections, advances, deposits, and receivables happens in Finance Operations — not in this accounting cockpit.",
    modules: [
      { key: "collections", title: "Collections (Finance Operations)", description: "Collection source records are recorded in Finance Operations. Review collection posture here; posting to accounting happens through the bridge.", route: ROUTES.admin.collections, icon: HandCoins, implemented: true, setupGate: true },
      { key: "collection_control_center", title: "Collection Control Center (Finance Operations)", description: "Read-only view of collection blockers and finance-account readiness. Operational recording belongs to Finance Operations.", route: ROUTES.admin.collectionControlCenter, icon: ClipboardCheck, implemented: true, readOnly: true, setupGate: true },
      { key: "receivables", title: "Outstandings (Finance Operations)", description: "Read-only view of unified unpaid dues. Outstanding source records belong to Finance Operations; see /admin/finance/outstandings.", route: ROUTES.admin.financeOutstandings, icon: Receipt, implemented: true, readOnly: true },
      { key: "direct_sale_receivables", title: "Direct-sale Receivables (Finance Operations)", description: "Read-only view of unpaid direct-sale invoices. Invoice source records are Sales & Contracts operations.", route: ROUTES.admin.billingInvoices, icon: ReceiptText, implemented: true, readOnly: true },
      { key: "customer_advances", title: "Customer Advances (Finance Operations)", description: "Customer advance source records are Finance Operations. Accounting bridge posting is triggered after the advance is recorded — not from this cockpit.", route: ROUTES.admin.financeCustomerAdvances, icon: WalletCards, implemented: true, setupGate: true },
      { key: "rent_lease_dues", title: "Rent / Lease Dues (Sales & Contracts)", description: "Rent/lease demand source records are Sales & Contracts. Accounting bridge is posted when mapping is confirmed — no bridge posting from this cockpit.", route: "/admin/rent-lease", icon: Building2, implemented: true, setupGate: true },
      { key: "security_deposits", title: "Security Deposits (Finance Operations)", description: "Deposit source records are Finance Operations. Review refund posture and damage recovery here; accounting bridge posting state follows the deposit workflow.", route: ROUTES.admin.financeDeposits, icon: Banknote, implemented: true, readOnly: true, setupGate: true },
    ],
  },
  {
    title: "Payables & Expenses",
    description: "Supplier, purchase, employee, and reversal money controls separated from collection posting.",
    modules: [
      { key: "vendor_payables", title: "Vendor Payables", description: "Review vendor outstanding balances and payable posture.", route: ROUTES.admin.vendorsOutstanding, icon: UsersRound, implemented: true, readOnly: true },
      { key: "purchase_bills", title: "Purchase Bills", description: "Review and manage purchase bills without changing customer collection behavior.", route: ROUTES.admin.accountingPurchaseBills, icon: ShoppingCart, implemented: true },
      { key: "expenses", title: "Expenses", description: "Record and review expense vouchers through the accounting register.", route: ROUTES.admin.accountingExpenses, icon: Receipt, implemented: true },
      { key: "payroll_accruals", title: "Payroll Accruals", description: "Review salary and payroll posture from the HR payroll workspace.", route: ROUTES.admin.hrPayroll, icon: WalletCards, implemented: true, readOnly: true, defaultStatus: "PARTIAL" },
      { key: "refunds_returns", title: "Refunds / Returns", description: "Review reversal and return documents; posting remains controlled in the underlying workflow.", route: ROUTES.admin.billingReversals, icon: Repeat2, implemented: true, readOnly: true, defaultStatus: "PARTIAL" },
    ],
  },
  {
    title: "Books & Posting",
    description: "Manual journals, money movements, bridge evidence, and inventory accounting controls.",
    modules: [
      { key: "manual_journals", title: "Manual Journals", description: "Use this for explicit admin-controlled journal entries only.", route: ROUTES.admin.accountingJournals, icon: ScrollText, implemented: true },
      { key: "money_movements", title: "Money Movements", description: "Review cash, bank, and UPI movement books without posting from the cockpit.", route: ROUTES.admin.accountingBooks, icon: Landmark, implemented: true },
      { key: "accounting_bridge_runs", title: "Accounting Bridge Runs", description: "Controlled bridge evidence and dry-run/posting visibility for system-generated accounting entries.", route: ROUTES.admin.accountingBridges, icon: Scale, implemented: true, readOnly: true },
      { key: "inventory_accounting", title: "Inventory Accounting", description: "Review stock accounting posture through inventory controls and valuation surfaces.", route: ROUTES.admin.inventory, icon: PackageSearch, implemented: true, readOnly: true, defaultStatus: "PARTIAL" },
    ],
  },
  {
    title: "Reconciliation & Reports",
    description: "Read-only report and reconciliation surfaces; reports do not recalculate books in the browser.",
    modules: [
      { key: "reconciliation", title: "Reconciliation", description: "Review reconciliation queues and exceptions. Resolution remains controlled by existing workflows.", route: ROUTES.admin.financeCanonicalReconciliation, icon: ShieldCheck, implemented: true, readOnly: true },
      { key: "trial_balance", title: "Trial Balance", description: "Read-only trial balance report from posted accounting data.", route: ROUTES.admin.accountingTrialBalance, icon: FileBarChart, implemented: true, readOnly: true },
      { key: "profit_loss", title: "Profit & Loss", description: "Read-only profit and loss report. It does not mutate ledger data.", route: ROUTES.admin.accountingProfitLoss, icon: TrendingUp, implemented: true, readOnly: true },
      { key: "balance_sheet", title: "Balance Sheet", description: "Read-only balance sheet report for accounting review.", route: ROUTES.admin.accountingBalanceSheet, icon: FileText, implemented: true, readOnly: true },
      { key: "gst_documents", title: "GST Documents", description: "Review GST tax invoices, credit notes, and debit notes in dedicated document registers.", route: ROUTES.admin.accountingTaxInvoices, icon: ReceiptText, implemented: true, readOnly: true },
      { key: "itr_export", title: "ITR Export", description: "Generate and review tax handoff packs from the dedicated export workflow.", route: ROUTES.admin.accountingItrPack, icon: FileText, implemented: true, readOnly: true },
    ],
  },
];

const STATUS_STYLES: Record<ModuleStatus, string> = {
  READY: "border-emerald-200 bg-emerald-50 text-emerald-800",
  BLOCKED: "border-red-200 bg-red-50 text-red-800",
  PARTIAL: "border-amber-200 bg-amber-50 text-amber-900",
  DEFERRED: "border-slate-200 bg-slate-100 text-slate-700",
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load accounting cockpit.";
}


function metricNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricString(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  return String(value);
}

function displayMetric(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "Not exposed";
  return String(value);
}

function asCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summaryExtra(summary: AccountingBridgeReadinessPayload["summary"] | undefined, key: string): number {
  return asCount((summary as Record<string, unknown> | undefined)?.[key]);
}

function eventStatus(event: AccountingBridgeReadinessEvent): string {
  return String(event.status || event.canonical_status || "").toUpperCase();
}

function bridgeEvents(data: CockpitData | null): AccountingBridgeReadinessEvent[] {
  return data?.bridgeReadiness?.events ?? [];
}

function activeBridgeBlockerEvents(data: CockpitData | null): AccountingBridgeReadinessEvent[] {
  return bridgeEvents(data).filter((event) => eventStatus(event).startsWith("BLOCKED"));
}

function bridgeStatusCount(data: CockpitData | null, status: string): number {
  return bridgeEvents(data).filter((event) => eventStatus(event) === status).length;
}

function actionableBridgeBlockerCount(data: CockpitData | null): number {
  return activeBridgeBlockerEvents(data).length;
}

function compactBlockers(readiness: AccountingSetupReadinessPayload | null): string[] {
  if (!readiness) return [];
  return readiness.finance_accounts
    .filter((account) => !account.collection_ready && account.is_active !== false)
    .map((account) => {
      const reason = account.collection_blocker_reason || account.blocker_reason || "Finance account is not collection-ready.";
      return `${account.name} (${account.kind}): ${reason}`;
    })
    .slice(0, 3);
}

function controlBlockers(data: CockpitData | null, setupBlockerCount: number | null): ActionItem[] {
  if (!data) return [];
  const bridgeSummary = data.bridgeReadiness?.summary;
  const setupStatusBlocked = data.setupStatus?.setup_health_status === "BLOCKED" || data.setupStatus?.status === "BLOCKED";
  const mappingBlockerCount = bridgeStatusCount(data, "BLOCKED_BY_MAPPING");
  const financeAccountBlockerCount = bridgeStatusCount(data, "BLOCKED_BY_FINANCE_ACCOUNT");
  const periodBlockerCount = bridgeStatusCount(data, "BLOCKED_BY_PERIOD");
  const numberingBlockerCount = bridgeStatusCount(data, "BLOCKED_BY_NUMBERING") + summaryExtra(bridgeSummary, "missing_numbering_profile_count");
  const approvalBlockerCount = bridgeStatusCount(data, "BLOCKED_BY_APPROVAL");
  const reconciliationExceptionCount = summaryExtra(bridgeSummary, "exception_count") + summaryExtra(bridgeSummary, "reconciliation_exception_count");
  const readyUnpostedCount = asCount(bridgeSummary?.ready_unposted_count);
  const items: ActionItem[] = [
    {
      label: "Finance account blockers",
      detail: financeAccountBlockerCount || setupBlockerCount ? `${financeAccountBlockerCount + (setupBlockerCount ?? 0)} finance/setup blocker(s) detected.` : "No finance-account blocker exposed.",
      href: ROUTES.admin.accountingFinanceAccounts,
      blocked: financeAccountBlockerCount > 0 || Boolean(setupBlockerCount && setupBlockerCount > 0),
    },
    {
      label: "Posting profile / setup blockers",
      detail: setupStatusBlocked ? "Posting profile health is blocked." : "No posting profile blocker exposed.",
      href: ROUTES.admin.accountingSetup,
      blocked: setupStatusBlocked,
    },
    {
      label: "Mapping audit blockers",
      detail: mappingBlockerCount ? `${mappingBlockerCount} mapping blocker(s) detected.` : "No mapping blocker exposed.",
      href: "/admin/accounting/setup/mapping-audit",
      blocked: mappingBlockerCount > 0,
    },
    {
      label: "Bridge period blockers",
      detail: periodBlockerCount ? `${periodBlockerCount} accounting-period blocker(s) detected.` : "No bridge period blocker exposed.",
      href: ROUTES.admin.accountingPeriods,
      blocked: periodBlockerCount > 0,
    },
    {
      label: "Numbering blockers",
      detail: numberingBlockerCount ? `${numberingBlockerCount} numbering issue(s) detected.` : "No numbering blocker exposed.",
      href: ROUTES.admin.settingsBusinessSetupDocumentNumbering,
      blocked: numberingBlockerCount > 0,
    },
    {
      label: "Approval blockers",
      detail: approvalBlockerCount ? `${approvalBlockerCount} approval blocker(s) detected.` : "No approval blocker exposed.",
      href: ROUTES.admin.accountingBridgeReconciliation,
      blocked: approvalBlockerCount > 0,
    },
    {
      label: "Unposted bridge candidates",
      detail: readyUnpostedCount ? `${readyUnpostedCount} ready source row(s) need explicit posting.` : "No ready-unposted bridge candidates.",
      href: `${ROUTES.admin.accountingBridgeReconciliation}?status=READY_UNPOSTED`,
      blocked: readyUnpostedCount > 0,
    },
    {
      label: "Reconciliation exceptions",
      detail: reconciliationExceptionCount ? `${reconciliationExceptionCount} reconciliation exception(s) require review.` : "No reconciliation exception exposed.",
      href: ROUTES.admin.accountingBridgeReconciliation,
      blocked: reconciliationExceptionCount > 0,
    },
  ];
  return items.filter((item) => item.blocked);
}

function bridgeStatus(readiness: AccountingReadiness | null): ModuleStatus {
  if (!readiness) return "PARTIAL";
  if (readiness.status === "READY") return "READY";
  return "BLOCKED";
}

function statusForModule(module: AccountingModuleDefinition, setupBlocked: boolean, readiness: AccountingReadiness | null): ModuleStatus {
  if (!module.implemented || !module.route) return "DEFERRED";
  if (["customer_advances", "rent_lease_dues", "security_deposits"].includes(module.key)) return bridgeStatus(readiness);
  if (module.setupGate && setupBlocked) return "BLOCKED";
  return module.defaultStatus ?? "READY";
}

function moduleActionLabel(module: AccountingModuleDefinition, status: ModuleStatus): string {
  if (!module.implemented || !module.route || status === "DEFERRED") return "Deferred";
  if (status === "BLOCKED" && module.setupGate) return "Fix setup";
  if (module.readOnly) return "Open read-only";
  return module.key === "rent_lease_dues" ? "Open rent/lease workspace" : "Open";
}

type MetricTone = "count-bad" | "count-good" | "status" | "neutral";

function metricToneCls(value: string | number | null | undefined, tone: MetricTone): string {
  const v = String(value ?? "");
  if (tone === "status") {
    if (v === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-900";
    if (v === "BLOCKED" || v === "Blocked") return "border-red-200 bg-red-50 text-red-900";
    if (v && v !== "Not exposed" && v !== "—") return "border-amber-200 bg-amber-50 text-amber-900";
    return "border-border bg-card text-foreground";
  }
  if (tone === "count-bad") {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return "border-amber-200 bg-amber-50 text-amber-900";
    return "border-border bg-card text-foreground";
  }
  if (tone === "count-good") {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return "border-emerald-200 bg-emerald-50 text-emerald-900";
    return "border-border bg-card text-foreground";
  }
  return "border-border bg-card text-foreground";
}

function ModuleCard({ module, setupBlocked, setupBlockers, readiness }: { module: AccountingModuleDefinition; setupBlocked: boolean; setupBlockers: string[]; readiness: AccountingReadiness | null }) {
  const status = statusForModule(module, setupBlocked, readiness);
  const Icon = module.icon;
  const isDeferred = status === "DEFERRED" || !module.implemented || !module.route;
  const actionHref = status === "BLOCKED" && module.setupGate ? ROUTES.admin.accountingChartOfAccounts : module.route;
  const blockers = status === "BLOCKED" ? (readiness?.blockers?.length ? readiness.blockers : setupBlockers) : [];

  const iconCls = {
    READY: "border-emerald-100 bg-emerald-50 text-emerald-700",
    BLOCKED: "border-red-100 bg-red-50 text-red-600",
    PARTIAL: "border-amber-100 bg-amber-50 text-amber-700",
    DEFERRED: "border-border bg-muted text-muted-foreground",
  }[status];
  const dotCls = {
    READY: "bg-emerald-400",
    BLOCKED: "bg-red-500",
    PARTIAL: "bg-amber-400",
    DEFERRED: "bg-slate-300",
  }[status];

  return (
    <article className="group flex min-h-[11rem] flex-col rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", iconCls)}>
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dotCls)} />
              {status}
            </span>
            {module.readOnly ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Read-only</span> : null}
          </div>
        </div>
        <div className="mt-3 flex-1">
          <h3 className="text-sm font-semibold leading-snug text-foreground">{module.title}</h3>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{module.description}</p>
          {blockers.length > 0 ? (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-900">
              <span className="font-semibold">{blockers.length} blocker{blockers.length === 1 ? "" : "s"}:</span>
              <span className="ml-1 line-clamp-1">{blockers[0]}</span>
            </div>
          ) : null}
          {module.deferredReason ? (
            <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">{module.deferredReason}</p>
          ) : null}
        </div>
      </div>
      <div className="border-t border-border px-4 py-2.5">
        {isDeferred || !actionHref ? (
          <span className="text-xs font-medium text-muted-foreground">Deferred</span>
        ) : (
          <Link href={actionHref} className="group/link flex items-center gap-1.5 text-xs font-semibold text-primary transition hover:text-primary/80">
            {moduleActionLabel(module, status)}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/link:translate-x-0.5" aria-hidden />
          </Link>
        )}
      </div>
    </article>
  );
}

export default function AdminAccountingPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CockpitData | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const [chartAccounts, financeAccounts, draftJournals, controlPayload, setupStatus, setupReadiness, bridgeReadiness, accountingReadiness] = await Promise.all([
        listChartOfAccounts(),
        listFinanceAccounts(),
        listJournalEntries({ status: "DRAFT" }),
        getAdminAccountingControlCenter() as Promise<AccountingControlPayload>,
        getAccountingSetupStatus(),
        getAccountingSetupReadiness(),
        getAccountingBridgeReadiness(),
        getAccountingReadiness(),
      ]);
      setData({ chartAccountsCount: chartAccounts.count, financeAccountsCount: financeAccounts.count, draftJournalsCount: draftJournals.count, postedMovementsCount: null, controlPayload, setupStatus, setupReadiness, bridgeReadiness, accountingReadiness });
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") setData(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => { void loadPage("initial"); }, []);

  const setupBlockers = useMemo(() => compactBlockers(data?.setupReadiness ?? null), [data?.setupReadiness]);
  const setupBlockerCount = metricNumber(data?.setupStatus?.setup_health_blockers_count) ?? data?.setupReadiness?.summary.blockers_count ?? null;
  const collectionReadyAccountsCount = data?.setupReadiness ? data.setupReadiness.summary.cash_accounts_ready_count + data.setupReadiness.summary.bank_accounts_ready_count + data.setupReadiness.summary.upi_accounts_ready_count : null;
  const setupBlocked = Boolean((setupBlockerCount ?? 0) > 0 || data?.setupStatus?.setup_health_status === "BLOCKED" || data?.setupStatus?.status === "BLOCKED");
  const bridgeStatusValue = metricString(data?.accountingReadiness?.status);
  const fixFirst = controlBlockers(data, setupBlockerCount);
  const readinessCounters = data?.accountingReadiness?.counters as Record<string, unknown> | undefined;
  const bridgeSummary = data?.bridgeReadiness?.summary;
  const reconciliationExceptionCount = summaryExtra(bridgeSummary, "exception_count") || summaryExtra(bridgeSummary, "reconciliation_exception_count") || metricNumber(readinessCounters?.reconciliation_exceptions) || 0;
  const mappingBlockerCount = bridgeStatusCount(data, "BLOCKED_BY_MAPPING") + (setupBlockerCount ?? 0);
  const bridgeBlockerCount = actionableBridgeBlockerCount(data);
  const readyUnpostedCount = asCount(bridgeSummary?.ready_unposted_count);
  const currentOpenPeriod = data?.bridgeReadiness?.accounting_period_readiness?.current_period?.code ?? data?.accountingReadiness?.accounting_period_readiness?.current_period?.code;
  const periodCloseStatus = data?.bridgeReadiness?.accounting_period_readiness?.current_period?.status ?? (data?.accountingReadiness?.accounting_period_readiness?.posting_controls_ready === false ? "Blocked" : data?.accountingReadiness?.accounting_period_readiness?.current_period?.status);

  return (
    <ERPPageShell
      eyebrow="Accounting & Finance"
      title="Accounting & Finance Cockpit"
      subtitle="Operator cockpit for accounting setup, collections, books, reconciliation, and reports. Posting is executed only from controlled workspaces."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting" }]}
      actions={[{ href: ROUTES.admin.accountingChartOfAccounts, label: "Chart of Accounts", variant: "secondary" }, { href: ROUTES.admin.accountingFinanceAccounts, label: "Finance Accounts", variant: "primary" }, { href: ROUTES.admin.setupReadiness, label: "Setup Readiness", variant: "secondary" }]}
      stats={[{ label: "Chart Accounts", value: displayMetric(data?.chartAccountsCount), tone: "info" }, { label: "Finance Accounts", value: displayMetric(data?.financeAccountsCount), tone: setupBlocked ? "warning" : "success" }, { label: "Bridge Status", value: displayMetric(bridgeStatusValue), tone: data?.accountingReadiness?.status === "READY" ? "success" : "warning" }, { label: "Collection-ready FA", value: displayMetric(collectionReadyAccountsCount), tone: "info" }]}
      statusBadge={{ label: data?.accountingReadiness?.status === "READY" ? "Bridge ready" : setupBlocked ? "Setup blocked" : "Read-only cockpit", tone: data?.accountingReadiness?.status === "READY" ? "success" : setupBlocked ? "warning" : "info" }}
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading accounting and finance cockpit..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load accounting cockpit" description={error} onRetry={() => void loadPage("initial")} /> : null}
        {!loading && !error && data ? (
          <>
            <ERPSectionShell
              title="Accounting Control Center"
              description="Active blockers, primary actions, and daily finance workflows."
              actions={
                <button type="button" onClick={() => void loadPage("refresh")} disabled={refreshing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60">
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshing ? "animate-spin" : "")} aria-hidden />
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              }
            >
              <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
                {/* Left: live counters + quick links */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Live counters</p>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-5">
                    {([
                      { label: "Readiness", value: displayMetric(bridgeStatusValue), tone: "status" },
                      { label: "Chart accounts", value: displayMetric(data.chartAccountsCount), tone: "neutral" },
                      { label: "Finance accounts", value: displayMetric(data.financeAccountsCount), tone: "neutral" },
                      { label: "Mapping blockers", value: displayMetric(mappingBlockerCount), tone: "count-bad" },
                      { label: "Collection-ready", value: displayMetric(collectionReadyAccountsCount), tone: "count-good" },
                      { label: "Open period", value: displayMetric(currentOpenPeriod), tone: "neutral" },
                      { label: "Period status", value: displayMetric(periodCloseStatus), tone: "status" },
                      { label: "Recon exceptions", value: displayMetric(reconciliationExceptionCount), tone: "count-bad" },
                      { label: "Ready unposted", value: displayMetric(readyUnpostedCount), tone: "count-bad" },
                      { label: "Bridge blockers", value: displayMetric(bridgeBlockerCount), tone: "count-bad" },
                    ] as { label: string; value: string; tone: MetricTone }[]).map(({ label, value, tone }) => (
                      <div key={label} className={cn("rounded-lg border px-2.5 py-2", metricToneCls(value, tone))}>
                        <div className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{label}</div>
                        <div className="mt-0.5 text-sm font-bold">{value}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Quick navigation</p>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
                    {([
                      { label: "Setup", Icon: Settings2, href: ROUTES.admin.accountingSetup },
                      { label: "Bridge Readiness", Icon: Scale, href: ROUTES.admin.accountingBridges },
                      { label: "Mapping Audit", Icon: ShieldCheck, href: "/admin/accounting/setup/mapping-audit" },
                      { label: "Reconciliation", Icon: Repeat2, href: ROUTES.admin.accountingBridgeReconciliation },
                      { label: "Periods", Icon: Calendar, href: ROUTES.admin.accountingPeriods },
                      { label: "Numbering", Icon: FileText, href: ROUTES.admin.settingsBusinessSetupDocumentNumbering },
                      { label: "Finance Accounts", Icon: Landmark, href: ROUTES.admin.accountingFinanceAccounts },
                    ] as { label: string; Icon: LucideIcon; href: string }[]).map(({ label, Icon, href }) => (
                      <Link key={label} href={href}
                        className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:border-[var(--surface-border-strong)] hover:bg-muted">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        {label}
                      </Link>
                    ))}
                  </div>
                </div>
                {/* Right: fix-first blockers */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Fix first</p>
                  {fixFirst.length === 0 ? (
                    <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                      <span>No active blocker — accounting setup, bridge, numbering, and reconciliation are all clear.</span>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-1.5">
                      {fixFirst.map((item, index) => (
                        <div key={item.label} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2">
                              <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">{index + 1}</span>
                              <div>
                                <div className="text-xs font-semibold text-amber-950">{item.label}</div>
                                <div className="mt-0.5 text-[11px] leading-4 text-amber-800">{item.detail}</div>
                              </div>
                            </div>
                            <Link href={item.href} className="shrink-0 text-[11px] font-semibold text-primary underline underline-offset-4 transition hover:opacity-75">Fix →</Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ERPSectionShell>
            {MODULE_GROUPS.map((group) => (
              <ERPSectionShell key={group.title} title={group.title} description={group.description}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {group.modules.map((module) => (
                    <ModuleCard key={module.key} module={module} setupBlocked={setupBlocked} readiness={data.accountingReadiness} setupBlockers={setupBlockers.length > 0 ? setupBlockers : ["Accounting setup readiness is blocked."]} />
                  ))}
                </div>
              </ERPSectionShell>
            ))}
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
