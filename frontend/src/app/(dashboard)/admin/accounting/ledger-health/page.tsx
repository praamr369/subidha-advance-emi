"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  FileSpreadsheet,
  FileText,
  FolderGit2,
  HelpCircle,
  History,
  Layers,
  LayoutDashboard,
  Loader2,
  Play,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sliders,
  Wallet,
} from "lucide-react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import {
  fetchSolopreneurLedgerHealth,
  postSolopreneurDailyClose,
  type LedgerHealthCheck,
  type LedgerHealthResponse,
  type SolopreneurCloseResponse,
} from "@/services/accounting";

type ReviewRoute = {
  title: string;
  category: "Primary Ledgers" | "Reconciliation & Governance" | "Financial Statements" | "Operational Desks";
  description: string;
  href: string;
  icon: typeof BookOpen;
  badge?: string;
};

const LEDGER_REVIEW_ROUTES: ReviewRoute[] = [
  {
    title: "General Journals",
    category: "Primary Ledgers",
    description: "Inspect posted, draft, and voided double-entry journal vouchers with debit/credit audit details.",
    href: ROUTES.admin.accountingJournals,
    icon: FileText,
    badge: "Core Journal",
  },
  {
    title: "General Ledger",
    category: "Primary Ledgers",
    description: "Account-by-account transaction history, running balances, and double-entry postings.",
    href: "/admin/accounting/ledger",
    icon: BookOpen,
    badge: "Account Ledger",
  },
  {
    title: "Cash & Bank Books",
    category: "Primary Ledgers",
    description: "Cash counter, UPI, and bank settlement account transaction registers.",
    href: ROUTES.admin.accountingBooks,
    icon: Wallet,
    badge: "Settlement Books",
  },
  {
    title: "Staff Ledger",
    category: "Primary Ledgers",
    description: "Employee and staff compensation, drawings, and operational advance ledger records.",
    href: ROUTES.admin.accountingStaffLedger,
    icon: Layers,
  },
  {
    title: "Bridge & Payment Reconciliation",
    category: "Reconciliation & Governance",
    description: "Verify operational payments, EMI receipts, deposits, and invoice posting bridges.",
    href: ROUTES.admin.accountingBridgeReconciliation,
    icon: FolderGit2,
    badge: "Posting Bridges",
  },
  {
    title: "Liability Reconciliation",
    category: "Reconciliation & Governance",
    description: "Audit customer advances, unapplied receipts, and security deposit liabilities.",
    href: ROUTES.admin.accountingLiabilityReconciliation,
    icon: Scale,
  },
  {
    title: "Trial Balance Check",
    category: "Reconciliation & Governance",
    description: "Diagnostic automation rules verifying double-entry constraints across all posted lines.",
    href: ROUTES.admin.accountingTrialBalanceCheck,
    icon: FileCheck,
    badge: "Automation Rules",
  },
  {
    title: "Financial Intelligence",
    category: "Reconciliation & Governance",
    description: "Executive posture snapshot across collections, billing, liabilities, and trial balance health.",
    href: ROUTES.admin.accountingFinancialIntelligence,
    icon: ShieldCheck,
  },
  {
    title: "Accounting Periods",
    category: "Reconciliation & Governance",
    description: "Manage monthly accounting period locks, financial years, and fiscal close readiness.",
    href: ROUTES.admin.accountingPeriods,
    icon: Calendar,
  },
  {
    title: "Trial Balance Report",
    category: "Financial Statements",
    description: "Full debit and credit balance summary across all Chart of Account categories.",
    href: ROUTES.admin.accountingTrialBalance,
    icon: FileSpreadsheet,
    badge: "Financial Report",
  },
  {
    title: "Profit & Loss",
    category: "Financial Statements",
    description: "Revenue, cost of goods sold, and operating expense performance report.",
    href: ROUTES.admin.accountingProfitLoss,
    icon: Scale,
  },
  {
    title: "Balance Sheet",
    category: "Financial Statements",
    description: "Summary statement of organization assets, liabilities, and owner equity.",
    href: ROUTES.admin.accountingBalanceSheet,
    icon: Layers,
  },
  {
    title: "Expense Workbench",
    category: "Operational Desks",
    description: "Register manual expenses, review draft claims, approve, and execute journal posting.",
    href: ROUTES.admin.accountingExpenses,
    icon: FileText,
  },
  {
    title: "Finance Accounts",
    category: "Operational Desks",
    description: "Configure cash desks, bank accounts, and active Chart of Account ledger mappings.",
    href: ROUTES.admin.accountingFinanceAccounts,
    icon: Sliders,
  },
  {
    title: "Chart of Accounts",
    category: "Operational Desks",
    description: "Master chart of account categories, system codes, and manual posting controls.",
    href: ROUTES.admin.accountingChartOfAccounts,
    icon: Sliders,
  },
];

function getCheckRoute(key: string): string {
  if (key.startsWith("journal.")) return ROUTES.admin.accountingJournals;
  if (key.startsWith("period.")) return ROUTES.admin.accountingPeriods;
  if (key.startsWith("balance.")) return ROUTES.admin.accountingTrialBalance;
  if (key.startsWith("line.inactive")) return ROUTES.admin.accountingChartOfAccounts;
  return ROUTES.admin.accountingTrialBalanceCheck;
}

export default function LedgerHealthPage() {
  const [data, setData] = useState<LedgerHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<SolopreneurCloseResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"checks" | "routes" | "close">("checks");

  const loadHealth = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const resp = await fetchSolopreneurLedgerHealth(isRefresh);
      setData(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ledger health check.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const handleDailyClose = async () => {
    setClosing(true);
    setError(null);
    try {
      const res = await postSolopreneurDailyClose();
      setCloseResult(res);
      await loadHealth(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Daily close execution failed.");
    } finally {
      setClosing(false);
    }
  };

  const checks = useMemo(() => data?.checks ?? [], [data]);
  const passedCount = checks.filter((c) => c.passed !== false && c.status !== "CRITICAL" && c.status !== "WARNING").length;
  const issueCount = checks.filter((c) => c.passed === false || c.status === "CRITICAL" || c.status === "WARNING").length;

  return (
    <ERPPageShell
      eyebrow="Accounting & Reconciliation"
      title="Ledger Health & Review"
      subtitle="Unified diagnostic readouts, automated double-entry verification, and direct review navigation routes."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Ledger Health & Review" },
      ]}
      actions={[
        {
          label: refreshing ? "Refreshing..." : "Refresh Check",
          variant: "secondary",
          onClick: () => {
            if (!loading && !refreshing) {
              void loadHealth(true);
            }
          },
        },
        {
          href: ROUTES.admin.accountingFinancialIntelligence,
          label: "Financial Intelligence",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.accountingJournals,
          label: "Journals",
          variant: "secondary",
        },
      ]}
      statusBadge={{
        label: loading ? "Checking..." : data?.is_balanced ? "Books Balanced" : "Balance Mismatch",
        tone: loading ? "info" : data?.is_balanced ? "success" : "danger",
      }}
      stats={[
        {
          label: "Trial Balance Status",
          value: loading || !data ? "—" : data.is_balanced ? "Balanced" : "Out of Balance",
          tone: loading || !data ? "default" : data.is_balanced ? "success" : "danger",
        },
        {
          label: "Total Debits",
          value: loading || !data ? "—" : formatRupee(data.total_debit),
          tone: "info",
        },
        {
          label: "Total Credits",
          value: loading || !data ? "—" : formatRupee(data.total_credit),
          tone: "info",
        },
        {
          label: "Net Difference",
          value: loading || !data ? "—" : formatRupee(data.difference),
          tone: loading || !data ? "default" : Number(data.difference) === 0 ? "success" : "warning",
        },
        {
          label: "Integrity Checks",
          value: loading || !data ? "—" : `${passedCount}/${checks.length} Passing`,
          tone: loading || !data ? "default" : issueCount === 0 ? "success" : "warning",
        },
      ]}
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("checks")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "checks"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              Automated Checks
              {checks.length > 0 && (
                <span className="ml-1 rounded-full bg-background/20 px-2 py-0.5 text-xs">
                  {issueCount > 0 ? `${issueCount} issues` : "All Clear"}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("routes")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "routes"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Ledger Review Routes
              <span className="ml-1 rounded-full bg-background/20 px-2 py-0.5 text-xs">
                {LEDGER_REVIEW_ROUTES.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("close")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "close"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Clock className="h-4 w-4" />
              Daily Close Workbench
            </button>
          </div>

          <Link
            href="/admin/finance-control"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            ← Back to Finance Control Tower
          </Link>
        </div>

        {loading ? <ERPLoadingState label="Running ledger health diagnostic checks..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Failed to Load Ledger Health"
            description={error}
            onRetry={() => void loadHealth(true)}
          />
        ) : null}

        {/* Tab 1: Automated Checks */}
        {!loading && !error && activeTab === "checks" && (
          <div className="space-y-6">
            <ERPSectionShell
              title="Automated Double-Entry & Ledger Checks"
              description="Live audit rules verifying balanced entries, open periods, line consistency, and unposted items."
            >
              {checks.length === 0 ? (
                <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
                  No automated diagnostic checks returned.
                </div>
              ) : (
                <div className="grid gap-3">
                  {checks.map((check) => {
                    const isPassed = check.passed !== false && check.status !== "CRITICAL" && check.status !== "WARNING";
                    const isWarning = check.status === "WARNING";
                    const isCritical = check.status === "CRITICAL";

                    let borderCls = "border-emerald-200 bg-emerald-50/40 dark:border-emerald-950/40 dark:bg-emerald-950/20";
                    let badgeCls = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300";
                    let statusLabel = "PASSED";

                    if (isCritical) {
                      borderCls = "border-red-300 bg-red-50/50 dark:border-red-950/50 dark:bg-red-950/20";
                      badgeCls = "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300";
                      statusLabel = "CRITICAL ISSUE";
                    } else if (isWarning) {
                      borderCls = "border-amber-300 bg-amber-50/50 dark:border-amber-950/50 dark:bg-amber-950/20";
                      badgeCls = "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300";
                      statusLabel = "ACTION REQUIRED";
                    } else if (check.status === "INFO") {
                      borderCls = "border-sky-200 bg-sky-50/40 dark:border-sky-950/40 dark:bg-sky-950/20";
                      badgeCls = "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300";
                      statusLabel = "INFO";
                    }

                    const routeHref = getCheckRoute(check.key);

                    return (
                      <div
                        key={check.key}
                        className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 shadow-sm transition hover:shadow-md ${borderCls}`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {isPassed ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : isCritical ? (
                              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            )}
                            <span className="font-semibold text-foreground text-sm">
                              {check.label || check.key}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeCls}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground pl-6">
                            {check.message || `Diagnostic check for rule key: ${check.key}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-4">
                          {typeof check.count === "number" && (
                            <div className="text-right">
                              <span className="text-sm font-bold tabular-nums text-foreground">
                                {check.count}
                              </span>
                              <p className="text-[10px] text-muted-foreground uppercase">Exceptions</p>
                            </div>
                          )}

                          <Link
                            href={routeHref}
                            className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition"
                          >
                            Inspect Route
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ERPSectionShell>
          </div>
        )}

        {/* Tab 2: Review Routes */}
        {!loading && !error && activeTab === "routes" && (
          <div className="space-y-8">
            {(["Primary Ledgers", "Reconciliation & Governance", "Financial Statements", "Operational Desks"] as const).map(
              (category) => {
                const categoryRoutes = LEDGER_REVIEW_ROUTES.filter((r) => r.category === category);
                return (
                  <ERPSectionShell
                    key={category}
                    title={category}
                    description={`Direct jump links into operational ${category.toLowerCase()} workbenches.`}
                  >
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {categoryRoutes.map((route) => {
                        const Icon = route.icon;
                        return (
                          <Link
                            key={route.href + route.title}
                            href={route.href}
                            className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-primary hover:shadow-md"
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <div className="rounded-lg bg-primary/10 p-2 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                  <Icon className="h-5 w-5" />
                                </div>
                                {route.badge && (
                                  <span className="rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                    {route.badge}
                                  </span>
                                )}
                              </div>
                              <h4 className="mt-3 text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                                {route.title}
                              </h4>
                              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                {route.description}
                              </p>
                            </div>
                            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary pt-2 border-t border-border/40">
                              Open Workbench
                              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </ERPSectionShell>
                );
              }
            )}
          </div>
        )}

        {/* Tab 3: Daily Close Workbench */}
        {!loading && !error && activeTab === "close" && (
          <div className="space-y-6">
            <ERPSectionShell
              title="Solopreneur Daily Close Action"
              description="Execute the automated daily close to reconcile liquid funds, bridge pending entries, and post daily closing journals."
            >
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">Post Daily Close</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                      This action reconciles unposted operational transactions across sales, collections, and expenses for the active day, verifying that all financial bridge postings are in equilibrium.
                    </p>
                  </div>
                </div>

                {closeResult && (
                  <div
                    className={`rounded-xl border p-4 text-sm ${
                      closeResult.status === "SUCCESS"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="h-4 w-4" />
                      Status: {closeResult.status}
                    </div>
                    <p className="mt-1 text-xs">
                      Processed: {closeResult.processed} item(s) · Errors: {closeResult.errors}
                    </p>
                  </div>
                )}

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    disabled={closing}
                    onClick={() => void handleDailyClose()}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition disabled:opacity-60"
                  >
                    {closing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Executing Daily Close...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Run Daily Close Now
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void loadHealth(true)}
                    disabled={refreshing}
                    className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition"
                  >
                    Refresh Health State
                  </button>
                </div>
              </div>
            </ERPSectionShell>
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
