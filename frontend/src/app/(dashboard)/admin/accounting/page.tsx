"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BookOpenText,
  Building2,
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

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { listChartOfAccounts, listFinanceAccounts, listJournalEntries } from "@/services/accounting";
import {
  getAccountingSetupReadiness,
  getAccountingSetupStatus,
  type AccountingSetupReadinessPayload,
  type AccountingSetupStatusPayload,
} from "@/services/accounting-setup";
import { getAdminAccountingControlCenter } from "@/services/phase5-control";

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
  recommendedAction?: string;
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
  controlPayload: AccountingControlPayload | null;
};

const MODULE_GROUPS: AccountingModuleGroup[] = [
  {
    title: "Setup & Master Data",
    description: "Accounts, finance accounts, setup gates, and readiness before staff handle live money.",
    modules: [
      {
        key: "chart_accounts",
        title: "Chart of Accounts",
        description: "Use this to maintain the account structure used by journals, reports, and posting profiles.",
        route: ROUTES.admin.accountingChartOfAccounts,
        icon: BookOpenText,
        implemented: true,
      },
      {
        key: "finance_accounts",
        title: "Finance Accounts",
        description: "Use this to check cash, bank, and UPI accounts before collection operations.",
        route: ROUTES.admin.accountingSetup,
        icon: Landmark,
        implemented: true,
        setupGate: true,
      },
      {
        key: "accounting_setup",
        title: "Accounting Setup",
        description: "Fix account mappings and setup blockers before live money operations.",
        route: ROUTES.admin.accountingSetup,
        icon: Settings2,
        implemented: true,
        setupGate: true,
      },
      {
        key: "setup_readiness",
        title: "Setup Readiness",
        description: "Read-only readiness center for business setup, collection gates, and document controls.",
        route: ROUTES.admin.setupReadiness,
        icon: ShieldCheck,
        implemented: true,
        readOnly: true,
      },
    ],
  },
  {
    title: "Collections & Receivables",
    description: "Customer money intake and receivable review without creating fake rent or lease collection actions.",
    modules: [
      {
        key: "collections",
        title: "Collections",
        description: "Use this when receiving customer money through approved collection workflows.",
        route: ROUTES.admin.collections,
        icon: HandCoins,
        implemented: true,
        setupGate: true,
      },
      {
        key: "collection_control_center",
        title: "Collection Control Center",
        description: "Review collection blockers, finance-account readiness, and cashier/admin collection posture.",
        route: ROUTES.admin.collectionControlCenter,
        icon: ClipboardCheck,
        implemented: true,
        readOnly: true,
        setupGate: true,
      },
      {
        key: "receivables",
        title: "Receivables",
        description: "Review unified unpaid dues and outstanding customer balances before collection follow-up.",
        route: ROUTES.admin.outstandings,
        icon: Receipt,
        implemented: true,
        readOnly: true,
      },
      {
        key: "direct_sale_receivables",
        title: "Direct-sale Receivables",
        description: "Use this to review unpaid direct-sale invoices before collection follow-up.",
        route: ROUTES.admin.billingInvoices,
        icon: ReceiptText,
        implemented: true,
        readOnly: true,
      },
      {
        key: "customer_advances",
        title: "Customer Advances",
        description: "Deferred until customer advance liability workflow is enabled end-to-end.",
        route: null,
        icon: WalletCards,
        implemented: false,
        defaultStatus: "DEFERRED",
        deferredReason: "Deferred until customer advance liability workflow is enabled.",
      },
      {
        key: "rent_lease_dues",
        title: "Rent / Lease Dues",
        description: "Deferred until rent/lease demand collection is enabled as a real backend workflow.",
        route: null,
        icon: Building2,
        implemented: false,
        defaultStatus: "DEFERRED",
        deferredReason: "Deferred until rent/lease demand collection is enabled.",
      },
      {
        key: "security_deposits",
        title: "Security Deposits",
        description: "Review rent/lease deposit liabilities and refund posture. This is not a fake collection action.",
        route: ROUTES.admin.financeDeposits,
        icon: Banknote,
        implemented: true,
        readOnly: true,
        defaultStatus: "PARTIAL",
      },
    ],
  },
  {
    title: "Payables & Expenses",
    description: "Supplier, purchase, employee, and reversal money controls separated from collection posting.",
    modules: [
      {
        key: "vendor_payables",
        title: "Vendor Payables",
        description: "Review vendor outstanding balances and payable posture.",
        route: ROUTES.admin.vendorsOutstanding,
        icon: UsersRound,
        implemented: true,
        readOnly: true,
      },
      {
        key: "purchase_bills",
        title: "Purchase Bills",
        description: "Review and manage purchase bills without changing customer collection behavior.",
        route: ROUTES.admin.accountingPurchaseBills,
        icon: ShoppingCart,
        implemented: true,
      },
      {
        key: "expenses",
        title: "Expenses",
        description: "Record and review expense vouchers through the accounting register.",
        route: ROUTES.admin.accountingExpenses,
        icon: Receipt,
        implemented: true,
      },
      {
        key: "payroll_accruals",
        title: "Payroll Accruals",
        description: "Review salary and payroll posture from the HR payroll workspace.",
        route: ROUTES.admin.hrPayroll,
        icon: WalletCards,
        implemented: true,
        readOnly: true,
        defaultStatus: "PARTIAL",
      },
      {
        key: "refunds_returns",
        title: "Refunds / Returns",
        description: "Review reversal and return documents; posting remains controlled in the underlying workflow.",
        route: ROUTES.admin.billingReversals,
        icon: Repeat2,
        implemented: true,
        readOnly: true,
        defaultStatus: "PARTIAL",
      },
    ],
  },
  {
    title: "Books & Posting",
    description: "Manual journals, money movements, bridge evidence, and inventory accounting controls.",
    modules: [
      {
        key: "manual_journals",
        title: "Manual Journals",
        description: "Use this for explicit admin-controlled journal entries only.",
        route: ROUTES.admin.accountingJournals,
        icon: ScrollText,
        implemented: true,
      },
      {
        key: "money_movements",
        title: "Money Movements",
        description: "Review cash, bank, and UPI movement books without posting from the cockpit.",
        route: ROUTES.admin.accountingBooks,
        icon: Landmark,
        implemented: true,
      },
      {
        key: "accounting_bridge_runs",
        title: "Accounting Bridge Runs",
        description: "Controlled bridge evidence and dry-run/posting visibility for system-generated accounting entries.",
        route: ROUTES.admin.accountingBridges,
        icon: Scale,
        implemented: true,
        readOnly: true,
      },
      {
        key: "inventory_accounting",
        title: "Inventory Accounting",
        description: "Review stock accounting posture through inventory controls and valuation surfaces.",
        route: ROUTES.admin.inventory,
        icon: PackageSearch,
        implemented: true,
        readOnly: true,
        defaultStatus: "PARTIAL",
      },
    ],
  },
  {
    title: "Reconciliation & Reports",
    description: "Read-only report and reconciliation surfaces; reports do not recalculate books in the browser.",
    modules: [
      {
        key: "reconciliation",
        title: "Reconciliation",
        description: "Review reconciliation queues and exceptions. Resolution remains controlled by existing workflows.",
        route: ROUTES.admin.financeCanonicalReconciliation,
        icon: ShieldCheck,
        implemented: true,
        readOnly: true,
      },
      {
        key: "trial_balance",
        title: "Trial Balance",
        description: "Read-only trial balance report from posted accounting data.",
        route: ROUTES.admin.accountingTrialBalance,
        icon: FileBarChart,
        implemented: true,
        readOnly: true,
      },
      {
        key: "profit_loss",
        title: "Profit & Loss",
        description: "Read-only profit and loss report. It does not mutate ledger data.",
        route: ROUTES.admin.accountingProfitLoss,
        icon: TrendingUp,
        implemented: true,
        readOnly: true,
      },
      {
        key: "balance_sheet",
        title: "Balance Sheet",
        description: "Read-only balance sheet report for accounting review.",
        route: ROUTES.admin.accountingBalanceSheet,
        icon: FileText,
        implemented: true,
        readOnly: true,
      },
      {
        key: "gst_documents",
        title: "GST Documents",
        description: "Review GST tax invoices, credit notes, and debit notes in dedicated document registers.",
        route: ROUTES.admin.accountingTaxInvoices,
        icon: ReceiptText,
        implemented: true,
        readOnly: true,
      },
      {
        key: "itr_export",
        title: "ITR Export",
        description: "Generate and review tax handoff packs from the dedicated export workflow.",
        route: ROUTES.admin.accountingItrPack,
        icon: FileText,
        implemented: true,
        readOnly: true,
      },
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

function displayMetric(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "Not exposed";
  return String(value);
}

function compactBlockers(readiness: AccountingSetupReadinessPayload | null): string[] {
  if (!readiness) return [];
  return readiness.finance_accounts
    .filter((account) => !account.collection_ready)
    .map((account) => {
      const reason = account.collection_blocker_reason || account.blocker_reason || "Finance account is not collection-ready.";
      return `${account.name} (${account.kind}): ${reason}`;
    })
    .slice(0, 3);
}

function statusForModule(module: AccountingModuleDefinition, setupBlocked: boolean): ModuleStatus {
  if (!module.implemented || !module.route) return "DEFERRED";
  if (module.setupGate && setupBlocked) return "BLOCKED";
  return module.defaultStatus ?? "READY";
}

function moduleActionLabel(module: AccountingModuleDefinition, status: ModuleStatus): string {
  if (!module.implemented || !module.route || status === "DEFERRED") return "Deferred";
  if (status === "BLOCKED" && module.setupGate) return "Fix setup";
  if (module.readOnly) return "Open read-only";
  return "Open";
}

function ModuleCard({
  module,
  setupBlocked,
  setupBlockers,
}: {
  module: AccountingModuleDefinition;
  setupBlocked: boolean;
  setupBlockers: string[];
}) {
  const status = statusForModule(module, setupBlocked);
  const Icon = module.icon;
  const isDeferred = status === "DEFERRED" || !module.implemented || !module.route;
  const actionHref = status === "BLOCKED" && module.setupGate ? ROUTES.admin.accountingSetup : module.route;
  const blockers = status === "BLOCKED" ? setupBlockers : [];

  return (
    <article className="flex min-h-[15rem] flex-col rounded-[1.5rem] border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted text-foreground">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[status]}`}>
            {status}
          </span>
          {module.readOnly ? (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
              Read-only
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-2">
        <h3 className="text-base font-semibold text-foreground">{module.title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{module.description}</p>
        {blockers.length > 0 ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {blockers.length} setup blocker{blockers.length === 1 ? "" : "s"}
            </div>
            <p className="mt-1 line-clamp-2">{blockers[0]}</p>
          </div>
        ) : null}
        {module.deferredReason ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {module.deferredReason}
          </p>
        ) : null}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        {isDeferred || !actionHref ? (
          <button
            type="button"
            disabled
            className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground"
          >
            Deferred
          </button>
        ) : (
          <Link
            href={actionHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            {moduleActionLabel(module, status)}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
      const [chartAccounts, financeAccounts, draftJournals, controlPayload, setupStatus, setupReadiness] = await Promise.all([
        listChartOfAccounts(),
        listFinanceAccounts(),
        listJournalEntries({ status: "DRAFT" }),
        getAdminAccountingControlCenter() as Promise<AccountingControlPayload>,
        getAccountingSetupStatus(),
        getAccountingSetupReadiness(),
      ]);

      setData({
        chartAccountsCount: chartAccounts.count,
        financeAccountsCount: financeAccounts.count,
        draftJournalsCount: draftJournals.count,
        postedMovementsCount: null,
        controlPayload,
        setupStatus,
        setupReadiness,
      });
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") setData(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const setupBlockers = useMemo(() => compactBlockers(data?.setupReadiness ?? null), [data?.setupReadiness]);
  const setupBlockerCount = data?.setupStatus?.setup_health_blockers_count ?? data?.setupReadiness?.summary.blockers_count ?? null;
  const blockedFinanceAccountsCount = data?.setupReadiness?.summary.blockers_count ?? null;
  const collectionReadyAccountsCount = data?.setupReadiness
    ? data.setupReadiness.summary.cash_accounts_ready_count +
      data.setupReadiness.summary.bank_accounts_ready_count +
      data.setupReadiness.summary.upi_accounts_ready_count
    : null;
  const setupBlocked = Boolean(
    (setupBlockerCount ?? 0) > 0 ||
      data?.setupStatus?.setup_health_status === "BLOCKED" ||
      data?.setupStatus?.status === "BLOCKED"
  );
  const backendModuleCount = Array.isArray(data?.controlPayload?.modules)
    ? data?.controlPayload?.modules?.length ?? 0
    : Array.isArray(data?.controlPayload?.capabilities)
      ? data?.controlPayload?.capabilities?.length ?? 0
      : 0;

  return (
    <ERPPageShell
      eyebrow="Accounting & Finance"
      title="Accounting & Finance Cockpit"
      subtitle="Icon-based operator cockpit for accounting setup, collections, books, reconciliation, and reports. This page is navigation/readiness only; it does not post payments, receipts, journals, or reconciliations."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingSetup, label: "Fix setup", variant: "primary" },
        { href: ROUTES.admin.collectionControlCenter, label: "Collection Control", variant: "secondary" },
        { href: ROUTES.admin.setupReadiness, label: "Setup Readiness", variant: "secondary" },
      ]}
      stats={[
        { label: "Chart Accounts", value: displayMetric(data?.chartAccountsCount), tone: "info" },
        { label: "Finance Accounts", value: displayMetric(data?.financeAccountsCount), tone: setupBlocked ? "warning" : "success" },
        { label: "Draft Journals", value: displayMetric(data?.draftJournalsCount), tone: (data?.draftJournalsCount ?? 0) > 0 ? "warning" : "success" },
        { label: "Posted Movements", value: displayMetric(data?.postedMovementsCount), tone: "info" },
      ]}
      statusBadge={{ label: setupBlocked ? "Setup blocked" : "Read-only cockpit", tone: setupBlocked ? "warning" : "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading ? <ERPLoadingState label="Loading accounting and finance cockpit..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load accounting cockpit"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && data ? (
          <>
            {backendModuleCount === 0 ? (
              <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                No accounting modules exposed by backend. This cockpit is using the checked admin route registry and existing read-only readiness endpoints; deferred modules are not linked.
              </div>
            ) : null}

            <ERPSectionShell
              title="Readiness posture"
              description="Operational counts are read from backend APIs. Values that are not exposed are shown explicitly instead of fake zeroes."
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {[
                  ["Chart accounts", displayMetric(data.chartAccountsCount)],
                  ["Finance accounts", displayMetric(data.financeAccountsCount)],
                  ["Draft journals", displayMetric(data.draftJournalsCount)],
                  ["Posted movements", displayMetric(data.postedMovementsCount)],
                  ["Setup blockers", displayMetric(setupBlockerCount)],
                  ["Collection-ready accounts", displayMetric(collectionReadyAccountsCount)],
                  ["Blocked finance accounts", displayMetric(blockedFinanceAccountsCount)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-border bg-card px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </ERPSectionShell>

            {setupBlocked ? (
              <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Setup blockers must be fixed before live money operations.
                </div>
                <p className="mt-1 text-red-900">
                  Blocked/system accounts are diagnostic only; collection-ready accounts require a posting-enabled leaf ASSET chart account.
                </p>
              </div>
            ) : null}

            {MODULE_GROUPS.length === 0 ? (
              <ERPEmptyState
                title="No accounting modules exposed by backend."
                description="The cockpit cannot render module cards until a capability list or local route-safe module map is available."
              />
            ) : (
              MODULE_GROUPS.map((group) => (
                <ERPSectionShell key={group.title} title={group.title} description={group.description}>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {group.modules.map((module) => (
                      <ModuleCard
                        key={module.key}
                        module={module}
                        setupBlocked={setupBlocked}
                        setupBlockers={setupBlockers.length > 0 ? setupBlockers : ["Accounting setup readiness is blocked."]}
                      />
                    ))}
                  </div>
                </ERPSectionShell>
              ))
            )}
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
