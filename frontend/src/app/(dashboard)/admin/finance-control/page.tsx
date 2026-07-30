"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { 
  Banknote, WalletCards, Receipt, UsersRound, Repeat2, HandCoins, Building2, ClipboardCheck, ArrowRightLeft,
  AlertTriangle, ShieldCheck, CalendarClock, ArrowDownCircle, Loader2, Play
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPMetricStrip, { type ERPMetric } from "@/components/erp/ERPMetricStrip";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import StatusBadge from "@/components/ui/status-badge";
import { fetchSolopreneurLedgerHealth, postSolopreneurDailyClose, type LedgerHealthResponse } from "@/services/accounting";
import { getUnifiedPayables, type UnifiedPayableData } from "@/services/payables";
import { getAdminFinanceDashboard, type AdminFinanceDashboardResponse } from "@/services/phase4-finance";
import { fetchFinancialIntelligence, type FinancialIntelligenceSnapshot } from "@/services/financial-intelligence";
import { getMoneyInHand, type MoneyInHandResponse, getFinanceOperationalSummary, type FinanceOperationalSummaryResponse } from "@/services/finance-operations";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

type TowerData = {
  dashboard: AdminFinanceDashboardResponse | null;
  intelligence: FinancialIntelligenceSnapshot | null;
  moneyInHand: MoneyInHandResponse | null;
  operations: FinanceOperationalSummaryResponse | null;
  health: LedgerHealthResponse | null;
  payables: UnifiedPayableData | null;
};

export default function FinanceControlPage() {
  const [data, setData] = useState<TowerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeMessage, setCloseMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [dashboard, intelligence, moneyInHand, operations, health, payables] = await Promise.all([
      getAdminFinanceDashboard().catch(() => null),
      fetchFinancialIntelligence().catch(() => null),
      getMoneyInHand().catch(() => null),
      getFinanceOperationalSummary().catch(() => null),
      fetchSolopreneurLedgerHealth().catch(() => null),
      getUnifiedPayables().catch(() => null),
    ]);

    if (!dashboard && !moneyInHand && !health && !payables) {
      setError("Finance control data is unavailable. Check that the API is reachable and try again.");
      setData(null);
    } else {
      setData({ dashboard, intelligence, moneyInHand, operations, health, payables });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runDailyClose = useCallback(async () => {
    setClosing(true);
    setCloseMessage(null);
    try {
      const result = await postSolopreneurDailyClose();
      setCloseMessage(
        result.status === "SUCCESS"
          ? `Daily close complete — ${result.processed} item(s) posted.`
          : `Daily close finished with issues — ${result.processed} posted, ${result.errors} error(s).`,
      );
      await load();
    } catch (err) {
      setCloseMessage(err instanceof Error ? err.message : "Daily close failed.");
    } finally {
      setClosing(false);
    }
  }, [load]);

  const cards = data?.dashboard?.cards;
  const health = data?.health;
  const payables = data?.payables;
  const moneyInHand = data?.moneyInHand;
  const intelligence = data?.intelligence;
  const operations = data?.operations;

  const ledgerBalanceByAccount = useMemo(() => {
    return new Map<number, string>(
      (moneyInHand?.accounts ?? []).map((account) => [
        account.finance_account_id,
        account.net_balance,
      ])
    );
  }, [moneyInHand]);

  const rankedAccounts = useMemo(() => {
    const opMap = new Map(
      (operations?.results ?? []).map((row) => [row.finance_account_id, row])
    );

    const allIds = new Set<number>([
      ...opMap.keys(),
      ...(moneyInHand?.accounts ?? []).map((a) => a.finance_account_id),
    ]);

    const combined = Array.from(allIds).map((id) => {
      const op = opMap.get(id);
      const mh = (moneyInHand?.accounts ?? []).find((a) => a.finance_account_id === id);
      return {
        finance_account_id: id,
        finance_account_name: op?.finance_account_name || mh?.finance_account_name || `Account #${id}`,
        kind: op?.kind || mh?.kind || "OTHER",
        chart_account_code: op?.chart_account_code || "",
        branch_name: op?.branch_name || null,
        payment_total: op?.payment_total || "0",
        advance_total: op?.advance_total || "0",
        security_deposit_total: op?.security_deposit_total || "0",
        reconciliation_status: op?.reconciliation_status || "OK",
        pending_settlement_amount: op?.pending_settlement_amount || "0",
        unapplied_advance_total: op?.unapplied_advance_total || "0",
      };
    });

    return combined.sort((left, right) => {
      const score = (row: (typeof combined)[number]) =>
        toNumber(ledgerBalanceByAccount.get(row.finance_account_id) ?? "0") * 1_000_000 +
        toNumber(row.pending_settlement_amount) * 1_000 +
        toNumber(row.unapplied_advance_total);
      return score(right) - score(left);
    });
  }, [operations, moneyInHand, ledgerBalanceByAccount]);

  const totalCustomerAdvances = useMemo(
    () => (operations?.results ?? []).reduce((sum, row) => sum + toNumber(row.advance_total), 0),
    [operations]
  );
  const totalSecurityDeposits = useMemo(
    () => (operations?.results ?? []).reduce((sum, row) => sum + toNumber((row as { security_deposit_total?: string }).security_deposit_total || "0"), 0),
    [operations]
  );

  const metrics: ERPMetric[] = [
    {
      label: "Total Liquid Balance",
      value: formatRupee(moneyInHand?.total),
      detail: moneyInHand
        ? `Cash ${formatRupee(moneyInHand.cash)} · UPI ${formatRupee(moneyInHand.upi)} · Bank ${formatRupee(moneyInHand.bank)}`
        : "Awaiting ledger data",
    },
    {
      label: "Today's Inflow",
      value: formatRupee(cards?.today_total_collection),
      detail: moneyInHand ? `Total Income: ${formatRupee(moneyInHand.total_income)}` : undefined,
    },
    {
      label: "Total Outflow",
      value: formatRupee(moneyInHand?.total_outflow),
      detail: moneyInHand ? `Net: ${formatRupee(toNumber(moneyInHand.total_income) - toNumber(moneyInHand.total_outflow))}` : undefined,
      className: toNumber(moneyInHand?.total_outflow) > 0 ? "border-rose-200" : undefined,
    },
    {
      label: "Supplier & Salary Payables",
      value: formatRupee(payables?.total_outstanding),
      detail: payables
        ? `${payables.total_items} item(s) · ${payables.needs_posting_count} awaiting posting`
        : "Awaiting payables data",
      className: (payables?.needs_posting_count ?? 0) > 0 ? "border-amber-200" : undefined,
    },
    {
      label: "Deposits Held",
      value: formatRupee(cards?.deposits_held),
      detail: `Refund pending: ${formatRupee(cards?.deposit_refunds_pending)} · Deductions: ${formatRupee(cards?.deposit_deductions)}`,
      className: toNumber(cards?.deposit_refunds_pending) > 0 ? "border-amber-200" : undefined,
    },
    {
      label: "Overdue Rent/Lease",
      value: String(cards?.rent_lease_overdue ?? 0),
      detail: `Rent pending: ${cards?.rent_monthly_invoices_pending ?? 0} · Lease pending: ${cards?.lease_monthly_invoices_pending ?? 0}`,
      className: (cards?.rent_lease_overdue ?? 0) > 0 ? "border-red-200" : undefined,
    },
    {
      label: "Customer Advances",
      value: formatRupee(totalCustomerAdvances),
      detail: "Customer money held before receivable rail allocation",
    },
    {
      label: "Security Deposits",
      value: formatRupee(totalSecurityDeposits),
      detail: "Security deposit liabilities held",
    },
    {
      label: "Books balanced",
      value: health ? (health.is_balanced ? "Balanced" : "Out of balance") : "—",
      detail: health ? `Difference ${formatRupee(health.difference)}` : undefined,
      className: health && !health.is_balanced ? "border-red-200" : undefined,
    },
  ];

  const failedChecks = (health?.checks ?? []).filter((check) => !check.passed);
  const intelligenceActionItems = intelligence?.action_items ?? [];

  const [activeTab, setActiveTab] = useState<"control" | "receivables" | "payables" | "treasury">("control");

  const financeLaneLinkClass =
    "inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <ERPPageShell
      eyebrow="Finance"
      title="Finance Control Tower"
      subtitle="Live unified overview of all liquid cash, operational posting posture, and treasury routing."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Finance Control" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="space-y-6">
        {/* Tab switcher */}
        <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-muted/60 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("control")}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${activeTab === "control" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <ClipboardCheck className="h-4 w-4" /> Control Tower
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("receivables")}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${activeTab === "receivables" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <HandCoins className="h-4 w-4" /> Receivables Control
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("payables")}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${activeTab === "payables" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <WalletCards className="h-4 w-4" /> Payables Control
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("treasury")}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${activeTab === "treasury" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Banknote className="h-4 w-4" /> Treasury & Transfers
          </button>
        </div>

        {/* Dynamic Tab Content */}
        <div className="bg-background rounded-2xl border border-border p-6 shadow-sm">
          {activeTab === "control" && (
            <div className="space-y-6">
              {/* Daily Close Action Banner */}
              {!loading && !error && data && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <ClipboardCheck className="h-4 w-4 text-primary" />
                    <span className="font-medium">Daily Close</span>
                    {closeMessage && (
                      <span className="text-xs text-muted-foreground ml-2">{closeMessage}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={closing}
                    onClick={() => void runDailyClose()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition disabled:opacity-50"
                  >
                    {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {closing ? "Running…" : "Run Daily Close"}
                  </button>
                </div>
              )}

              {loading && <LoadingBlock />}
              {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
              {!loading && !error && data && (
                <>
                  <ERPMetricStrip metrics={metrics} />

                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Left Column: Inflow / Receivables */}
                    <div className="space-y-6">
                      <ERPSectionShell title="Where your money came from" description="Income categorized by source and rail.">
                        {moneyInHand?.income_by_source && moneyInHand.income_by_source.length > 0 ? (
                          <div className="space-y-3">
                            {moneyInHand.income_by_source.map((source) => (
                              <div key={source.source_type} className="flex justify-between items-center p-3 border rounded-xl bg-green-50/30">
                                <span className="text-sm font-medium text-muted-foreground">{source.label}</span>
                                <span className="font-semibold">{formatRupee(source.amount)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-center text-sm text-muted-foreground border rounded-xl bg-muted/20">
                            No income recorded yet.
                          </div>
                        )}
                        <div className="mt-4 flex gap-4 text-xs font-semibold">
                          <span className="text-emerald-700 bg-emerald-100 px-2 py-1 rounded">Direct Sale Revenue: {formatRupee(cards?.direct_sale_revenue)}</span>
                          <span className="text-blue-700 bg-blue-100 px-2 py-1 rounded">Direct Sale Unpaid: {formatRupee(cards?.direct_sale_outstanding)}</span>
                        </div>
                      </ERPSectionShell>
                      
                      <ERPSectionShell title="Payment Method Mix" description="Collections grouped by settlement account.">
                        <div className="grid grid-cols-3 gap-2">
                           {data.dashboard?.payment_method_split_today.map((pm) => (
                             <div key={pm.payment_method} className="p-3 border rounded-xl text-center">
                               <div className="text-xs uppercase text-muted-foreground mb-1">{pm.payment_method}</div>
                               <div className="font-bold">{formatRupee(pm.amount)}</div>
                               <div className="text-[10px] text-muted-foreground mt-0.5">{pm.count} txn(s)</div>
                             </div>
                           ))}
                        </div>
                      </ERPSectionShell>

                      <ERPSectionShell title="Receivables Aging" description="Unpaid EMI risk profile.">
                        <div className="space-y-2">
                           {data.dashboard?.overdue_aging.map((bucket) => (
                             <div key={bucket.bucket} className="flex justify-between p-2 border-b text-sm">
                               <span className="text-muted-foreground">{bucket.bucket}</span>
                               <span className="font-mono text-red-600 font-medium">{formatRupee(bucket.amount)} ({bucket.count})</span>
                             </div>
                           ))}
                        </div>
                      </ERPSectionShell>

                      {/* Overdue Rent/Lease Demands */}
                      <ERPSectionShell title="Overdue Rent/Lease Demands" description="Outstanding rent & lease invoices requiring action.">
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 p-3 border rounded-xl bg-red-50/40">
                              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                              <div>
                                <div className="text-xs text-muted-foreground">Overdue Demands</div>
                                <div className="font-bold text-red-700 text-lg">{cards?.rent_lease_overdue ?? 0}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 p-3 border rounded-xl bg-amber-50/40">
                              <CalendarClock className="h-4 w-4 text-amber-600 shrink-0" />
                              <div>
                                <div className="text-xs text-muted-foreground">Upcoming (30d)</div>
                                <div className="font-bold text-amber-700 text-lg">{cards?.upcoming_rent_lease_due_dates ?? 0}</div>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 border rounded-xl bg-blue-50/30">
                              <div className="text-xs text-muted-foreground">Rent Invoices Pending</div>
                              <div className="font-semibold text-blue-700">{cards?.rent_monthly_invoices_pending ?? 0}</div>
                            </div>
                            <div className="p-3 border rounded-xl bg-purple-50/30">
                              <div className="text-xs text-muted-foreground">Lease Invoices Pending</div>
                              <div className="font-semibold text-purple-700">{cards?.lease_monthly_invoices_pending ?? 0}</div>
                            </div>
                          </div>
                          {/* Contracts nearing return */}
                          {(cards?.contracts_nearing_return_date ?? 0) > 0 && (
                            <div className="flex items-center gap-2 p-3 border border-amber-200 rounded-xl bg-amber-50/50">
                              <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
                              <div className="text-sm">
                                <span className="font-semibold text-amber-800">{cards?.contracts_nearing_return_date}</span>
                                <span className="text-muted-foreground"> contract(s) nearing return · </span>
                                <span className="font-semibold text-amber-800">{cards?.return_inspections_pending ?? 0}</span>
                                <span className="text-muted-foreground"> inspection(s) pending</span>
                              </div>
                            </div>
                          )}
                          <Link href={ROUTES.admin.financeOutstandings ?? "/admin/finance/outstandings"} className="text-sm font-medium text-primary hover:underline">
                            View All Overdue Outstandings →
                          </Link>
                        </div>
                      </ERPSectionShell>
                    </div>

                    {/* Right Column: Outflow / Payables & Posture */}
                    <div className="space-y-6">
                      <ERPSectionShell title="Where your money went" description="Ledger-posted outflows by category.">
                        {moneyInHand?.outflow_by_source && moneyInHand.outflow_by_source.length > 0 ? (
                          <div className="space-y-2">
                            {moneyInHand.outflow_by_source.map((source) => (
                              <div key={source.source_type} className="flex justify-between items-center p-3 border rounded-xl bg-red-50/30">
                                <span className="text-sm font-medium text-muted-foreground">{source.label}</span>
                                <span className="font-semibold text-red-700">{formatRupee(source.amount)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between items-center pt-2 border-t text-sm font-semibold">
                              <span>Total Outflow</span>
                              <span className="text-red-700">{formatRupee(moneyInHand.total_outflow)}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 text-center text-sm text-muted-foreground border rounded-xl bg-muted/20">
                            No outflows recorded yet.
                          </div>
                        )}
                      </ERPSectionShell>

                      {/* Payables Breakdown */}
                      <ERPSectionShell title="Supplier Payable & Payroll" description="Outstanding payables by category — not yet posted to ledger.">
                        {payables && payables.type_summary.length > 0 ? (
                          <div className="space-y-2">
                            {payables.type_summary.map((ts) => (
                              <div key={ts.payable_type} className="flex justify-between items-center p-3 border rounded-xl bg-orange-50/30">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-muted-foreground">{ts.label}</span>
                                  <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">{ts.count}</span>
                                </div>
                                <span className="font-semibold text-orange-700">{formatRupee(ts.total)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between items-center pt-2 border-t text-sm font-semibold">
                              <span>Total Outstanding</span>
                              <span className="text-orange-700">{formatRupee(payables.total_outstanding)}</span>
                            </div>
                            <Link href={ROUTES.admin.payables ?? "/admin/payables"} className="text-sm font-medium text-primary hover:underline">
                              Open Payable Command Center →
                            </Link>
                          </div>
                        ) : (
                          <div className="p-4 text-center text-sm text-muted-foreground border rounded-xl bg-muted/20">
                            No outstanding payables.
                          </div>
                        )}
                      </ERPSectionShell>

                      {/* Recent Outflows */}
                      <ERPSectionShell title="Recent Outflows" description="Latest outgoing cash movements from the ledger.">
                        {moneyInHand?.recent_outflows && moneyInHand.recent_outflows.length > 0 ? (
                          <div className="space-y-1.5">
                            {moneyInHand.recent_outflows.map((row, idx) => (
                              <div key={`${row.reference}-${idx}`} className="flex items-center justify-between gap-2 p-2 border rounded-lg bg-rose-50/20 text-sm">
                                <div className="flex items-center gap-2 min-w-0">
                                  <ArrowDownCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                                  <div className="min-w-0">
                                    <div className="font-medium truncate">{row.source_label}</div>
                                    <div className="text-[10px] text-muted-foreground truncate">
                                      {row.reference} · {row.kind} · {row.entry_date}
                                    </div>
                                  </div>
                                </div>
                                <span className="font-mono font-semibold text-rose-700 shrink-0">{formatRupee(row.amount)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-center text-sm text-muted-foreground border rounded-xl bg-muted/20">
                            No recent outflows.
                          </div>
                        )}
                      </ERPSectionShell>

                      <ERPSectionShell title="Operational Settlement Posture" description="Live balance held in each cash desk and settlement account.">
                         {rankedAccounts && rankedAccounts.length > 0 ? (
                           <div className="space-y-3">
                             {rankedAccounts.map((acc) => {
                               const balanceHeld = ledgerBalanceByAccount.get(acc.finance_account_id) ?? "0";
                               return (
                                 <div key={acc.finance_account_id} className="p-3 border rounded-xl bg-slate-50/50 space-y-2">
                                   <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                     <div>
                                       <span className="font-semibold text-foreground">{acc.finance_account_name} · {acc.kind}</span>
                                       <div className="mt-0.5 text-[11px] text-muted-foreground">
                                         Chart {acc.chart_account_code || "—"} · Branch {acc.branch_name || "Shared"} · EMI collections {formatRupee(acc.payment_total)} · Customer advances {formatRupee(acc.advance_total)} · Security deposits {formatRupee((acc as { security_deposit_total?: string }).security_deposit_total || "0")}
                                       </div>
                                     </div>
                                     <div className="flex flex-wrap items-center gap-1.5">
                                       <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                                         Balance held {formatRupee(balanceHeld)}
                                       </span>
                                       <StatusBadge
                                         status={acc.reconciliation_status || "UNKNOWN"}
                                         label={acc.reconciliation_status || "—"}
                                       />
                                     </div>
                                   </div>
                                   <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1.5 border-t border-border/50 text-muted-foreground">
                                     <span>Pending settlement: <strong className="font-mono font-medium text-foreground">{formatRupee(acc.pending_settlement_amount)}</strong></span>
                                     <span>Customer advances: <strong className="font-mono font-medium text-foreground">{formatRupee(acc.advance_total)} ({formatRupee(acc.unapplied_advance_total)} unapplied)</strong></span>
                                     <span>Security deposits: <strong className="font-mono font-medium text-foreground">{formatRupee((acc as { security_deposit_total?: string }).security_deposit_total || "0")}</strong></span>
                                   </div>
                                 </div>
                               );
                             })}
                           </div>
                         ) : (
                           <div className="p-4 text-center text-sm text-muted-foreground border rounded-xl bg-muted/20">
                             All settlement accounts are clear.
                           </div>
                         )}
                      </ERPSectionShell>
                      
                      <ERPSectionShell title="Reconciliation & Exceptions" description="Ledger health and intelligence checks.">
                        {(failedChecks.length > 0 || intelligenceActionItems.length > 0) ? (
                          <ul className="space-y-2 text-sm">
                            {failedChecks.map((check) => (
                              <li key={check.key} className="flex justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-900">
                                <span className="font-medium">{check.key}</span>
                                {typeof check.count === "number" && <span className="font-bold tabular-nums">{check.count}</span>}
                              </li>
                            ))}
                            {intelligenceActionItems.map((item) => (
                              <li key={item.key} className="flex justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                                <span className="font-medium">{item.title}</span>
                                <span className="font-bold tabular-nums">{item.count}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <EmptyState title="All Clear" description="No ledger exceptions detected." />
                        )}
                        <div className="mt-4">
                          <Link href="/admin/accounting/ledger-health" className="text-sm font-medium text-primary hover:underline">
                            View Ledger Review Routes →
                          </Link>
                        </div>
                      </ERPSectionShell>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "receivables" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm text-emerald-800">
                <strong>Receivables & Collections</strong>: Manage all incoming customer cash flows, advances, and outstanding EMI/Rent.
              </div>
              <nav className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Link href={ROUTES.admin.collections ?? "/admin/collections"} className={financeLaneLinkClass}>
                  <HandCoins className="h-5 w-5 text-emerald-600" />
                  Collections Master
                </Link>
                <Link href={ROUTES.admin.financeOutstandings ?? "/admin/finance/outstandings"} className={financeLaneLinkClass}>
                  <Receipt className="h-5 w-5 text-orange-600" />
                  Overdue Outstandings
                </Link>
                <Link href={ROUTES.admin.financeCustomerAdvances ?? "/admin/finance/customer-advances"} className={financeLaneLinkClass}>
                  <WalletCards className="h-5 w-5 text-blue-600" />
                  Customer Advances
                </Link>
                <Link href="/admin/finance/customer-credits" className={financeLaneLinkClass}>
                  <Building2 className="h-5 w-5 text-purple-600" />
                  Customer Credits
                </Link>
                <Link href={ROUTES.admin.financeCollect ?? "/admin/finance/collect"} className={financeLaneLinkClass}>
                  <Banknote className="h-5 w-5 text-green-600" />
                  Collect Payment
                </Link>
              </nav>
            </div>
          )}

          {activeTab === "payables" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 text-sm text-orange-800">
                <strong>Payables & Unified Treasury</strong>: Your single pane of glass for all money leaving the business.
              </div>
              <nav className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Link href="/admin/accounting/expenses" className={financeLaneLinkClass}>
                  <WalletCards className="h-5 w-5 text-orange-600" />
                  Expenses Workspace
                </Link>
                <Link href="/admin/accounting/purchase-bills" className={financeLaneLinkClass}>
                  <Receipt className="h-5 w-5 text-slate-600" />
                  Purchase Bills
                </Link>
                <Link href="/admin/hr/salary" className={financeLaneLinkClass}>
                  <UsersRound className="h-5 w-5 text-blue-600" />
                  Staff Salary
                </Link>
                <Link href="/admin/vendors/settlements" className={financeLaneLinkClass}>
                  <Banknote className="h-5 w-5 text-red-600" />
                  Vendor Settlements
                </Link>
              </nav>
            </div>
          )}

          {activeTab === "treasury" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-sm text-rose-800">
                <span><strong>Treasury & Reversals</strong>: Strict treasury control over bank deposits and reversed receipts.</span>
                <Link href="/admin/finance/transfers/new" className="inline-flex items-center gap-2 bg-rose-600 text-white px-3 py-2 rounded-lg text-xs font-semibold shadow hover:bg-rose-700 transition">
                  <ArrowRightLeft className="w-4 h-4" /> New Admin Finance Transfer
                </Link>
              </div>
              <nav className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Link href={ROUTES.admin.financeDeposits ?? "/admin/finance/deposits"} className={financeLaneLinkClass}>
                  <Banknote className="h-5 w-5 text-emerald-600" />
                  Bank Deposits
                </Link>
                <Link href={ROUTES.admin.financeReversalControl ?? "/admin/finance/reversal-control"} className={financeLaneLinkClass}>
                  <Repeat2 className="h-5 w-5 text-rose-600" />
                  Reversal Control
                </Link>
                <Link href="/admin/finance/refunds" className={financeLaneLinkClass}>
                  <HandCoins className="h-5 w-5 text-red-600" />
                  Refunds
                </Link>
                <Link href="/admin/finance/commissions" className={financeLaneLinkClass}>
                  <UsersRound className="h-5 w-5 text-purple-600" />
                  Commissions Log
                </Link>
                <Link href={ROUTES.admin.financePayoutBatches ?? "/admin/finance/payout-batches"} className={financeLaneLinkClass}>
                  <Banknote className="h-5 w-5 text-indigo-600" />
                  Payout Batches
                </Link>
                <Link href="/admin/finance-transfers" className={financeLaneLinkClass}>
                  <ArrowRightLeft className="h-5 w-5 text-orange-600" />
                  Internal Ledger Transfers
                </Link>
              </nav>
            </div>
          )}
        </div>
      </div>
    </ERPPageShell>
  );
}
