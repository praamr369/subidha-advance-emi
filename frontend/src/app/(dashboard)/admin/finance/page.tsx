"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import DashboardTimeWindowSelector from "@/components/dashboard/DashboardTimeWindowSelector";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch, toArray } from "@/lib/api";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  listChartOfAccounts,
  listFinanceAccounts,
  listPurchaseBills,
  type AccountingPaginatedResponse,
  type AccountingPurchaseBill,
  type ChartOfAccount,
  type FinanceAccount,
} from "@/services/accounting";
import type { DashboardWindowPreset } from "@/services/dashboard-types";
import {
  getAdminAnalyticsSummary,
  type AdminAnalyticsSummaryResponse,
} from "@/services/reports";
import type { AdminCommissionSummaryResponse } from "@/types/commission";

type PayoutBatchRow = {
  id: number;
  status: string;
  total_amount: string;
  commission_count: number;
  created_at?: string;
  finalized_at?: string | null;
  cancelled_at?: string | null;
};

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load finance dashboard.";
}

function normalizePayoutBatch(row: Record<string, unknown>): PayoutBatchRow {
  return {
    id: toNumber(row.id),
    status:
      (typeof row.status === "string" && row.status) ||
      (typeof row.batch_status === "string" && row.batch_status) ||
      "DRAFT",
    total_amount: toMoneyString(
      row.total_amount ??
        row.total_commission_amount ??
        row.amount_total ??
        row.payout_total
    ),
    commission_count: toNumber(
      row.commission_count ?? row.item_count ?? row.total_items ?? row.row_count
    ),
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    finalized_at:
      typeof row.finalized_at === "string" || row.finalized_at === null
        ? (row.finalized_at as string | null)
        : undefined,
    cancelled_at:
      typeof row.cancelled_at === "string" || row.cancelled_at === null
        ? (row.cancelled_at as string | null)
        : undefined,
  };
}

function MiniBar({
  label,
  value,
  total,
  amount,
}: {
  label: string;
  value: number;
  total: number;
  amount: string;
}) {
  const width = total <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / total) * 100)));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-muted-foreground">{amount}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FinanceLaneCard({
  eyebrow,
  title,
  description,
  value,
  secondaryValue,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  tone = "default",
}: {
  eyebrow: string;
  title: string;
  description: string;
  value: string;
  secondaryValue?: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  tone?: "default" | "warning" | "success" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : "border-slate-200 bg-white";

  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">{eyebrow}</div>
      <h2 className="mt-2 text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">{description}</p>

      <div className="mt-4 space-y-1">
        <div className="text-2xl font-semibold text-slate-900">{value}</div>
        {secondaryValue ? <div className="text-sm text-slate-600">{secondaryValue}</div> : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={primaryHref}
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
        >
          {primaryLabel}
        </Link>

        {secondaryHref && secondaryLabel ? (
          <Link
            href={secondaryHref}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export default function AdminFinancePage() {
  const [summary, setSummary] = useState<AdminCommissionSummaryResponse | null>(null);
  const [batches, setBatches] = useState<PayoutBatchRow[]>([]);
  const [analytics, setAnalytics] = useState<AdminAnalyticsSummaryResponse | null>(null);
  const [chartAccounts, setChartAccounts] =
    useState<AccountingPaginatedResponse<ChartOfAccount> | null>(null);
  const [financeAccounts, setFinanceAccounts] =
    useState<AccountingPaginatedResponse<FinanceAccount> | null>(null);
  const [draftPurchaseBills, setDraftPurchaseBills] =
    useState<AccountingPaginatedResponse<AccountingPurchaseBill> | null>(null);
  const [approvedPurchaseBills, setApprovedPurchaseBills] =
    useState<AccountingPaginatedResponse<AccountingPurchaseBill> | null>(null);

  const [windowPreset, setWindowPreset] =
    useState<DashboardWindowPreset>("THIS_MONTH");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyticsQuery = useMemo(
    () =>
      windowPreset === "CUSTOM"
        ? {
            window: windowPreset,
            start_date: startDate || undefined,
            end_date: endDate || undefined,
          }
        : {
            window: windowPreset,
          },
    [endDate, startDate, windowPreset]
  );

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const [
          summaryPayload,
          batchesPayload,
          analyticsPayload,
          chartPayload,
          financeAccountPayload,
          draftPurchasePayload,
          approvedPurchasePayload,
        ] = await Promise.all([
          apiFetch<AdminCommissionSummaryResponse>("/admin/commissions/summary/"),
          apiFetch<unknown>("/admin/commission-payout-batches/list/"),
          getAdminAnalyticsSummary(analyticsQuery),
          listChartOfAccounts(),
          listFinanceAccounts(),
          listPurchaseBills({ status: "DRAFT", page_size: 1 }),
          listPurchaseBills({ status: "APPROVED", page_size: 1 }),
        ]);

        setSummary(summaryPayload);
        setBatches(
          toArray<Record<string, unknown>>(batchesPayload).map(normalizePayoutBatch)
        );
        setAnalytics(analyticsPayload);
        setChartAccounts(chartPayload);
        setFinanceAccounts(financeAccountPayload);
        setDraftPurchaseBills(draftPurchasePayload);
        setApprovedPurchaseBills(approvedPurchasePayload);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setSummary(null);
          setBatches([]);
          setAnalytics(null);
          setChartAccounts(null);
          setFinanceAccounts(null);
          setDraftPurchaseBills(null);
          setApprovedPurchaseBills(null);
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [analyticsQuery]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const draftBatchCount = useMemo(
    () => batches.filter((row) => row.status.toUpperCase() === "DRAFT").length,
    [batches]
  );

  const finalizedBatchCount = useMemo(
    () => batches.filter((row) => row.status.toUpperCase() === "FINALIZED").length,
    [batches]
  );

  const cancelledBatchCount = useMemo(
    () => batches.filter((row) => row.status.toUpperCase() === "CANCELLED").length,
    [batches]
  );

  const recentBatches = useMemo(() => batches.slice(0, 5), [batches]);

  const methodRows = analytics?.payment_method_mix.rows ?? [];
  const cashNet = toNumber(methodRows.find((row) => row.method === "CASH")?.net_amount);
  const bankNet = toNumber(methodRows.find((row) => row.method === "BANK")?.net_amount);
  const upiNet = toNumber(methodRows.find((row) => row.method === "UPI")?.net_amount);
  const windowNet = toNumber(analytics?.overview.window_net_collections);

  const outstandingReceivables = toNumber(analytics?.overview.outstanding_amount);
  const overdueAmount = toNumber(analytics?.overview.overdue_emi_amount);
  const reconciliationFlags = toNumber(analytics?.overview.reconciliation_flagged_count);
  const purchaseQueueCount =
    (draftPurchaseBills?.count ?? 0) + (approvedPurchaseBills?.count ?? 0);
  const chartAccountCount = chartAccounts?.count ?? 0;
  const financeAccountCount = financeAccounts?.count ?? 0;

  const directSalesGross = toNumber(analytics?.direct_sales_posture.summary.gross_total);
  const directSalesCount = analytics?.direct_sales_posture.summary.count ?? 0;
  const directSalesTrend = analytics?.direct_sales_posture.trend ?? [];
  const directSalesTrendMax = directSalesTrend.reduce(
    (max, row) => Math.max(max, toNumber(row.gross_total)),
    0
  );

  const receivableAging = analytics?.receivables_pressure.aging ?? [];
  const receivableAgingMax = receivableAging.reduce(
    (max, row) => Math.max(max, toNumber(row.amount)),
    0
  );

  return (
    <PortalPage
      title="Finance Control Center"
      subtitle="Workflow hub for accounts, books, procurement, direct sales, reconciliation exceptions, commissions, and payout controls."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Partner Finance", href: ROUTES.admin.financeCommissions },
        { label: "Finance" },
      ]}
      actions={[
        {
          href: ROUTES.admin.financeCommissions,
          label: "Open Commissions",
          variant: "primary",
        },
        {
          href: ROUTES.admin.financePayoutBatches,
          label: "Open Payout Batches",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Window Collections",
          value: money(analytics?.overview.window_net_collections),
          tone: "success",
        },
        {
          label: "Outstanding",
          value: money(analytics?.overview.outstanding_amount),
          tone: "warning",
        },
        {
          label: "Reconciliation Flags",
          value: String(analytics?.overview.reconciliation_flagged_count ?? 0),
          tone:
            (analytics?.overview.reconciliation_flagged_count ?? 0) > 0
              ? "warning"
              : undefined,
        },
        {
          label: "Payout Batches",
          value: String(batches.length),
        },
        {
          label: "Purchase Bills",
          value: String(purchaseQueueCount),
          tone: purchaseQueueCount > 0 ? "warning" : "success",
        },
      ]}
      statusBadge={{
        label: "Finance Operations",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        <DashboardTimeWindowSelector
          value={windowPreset}
          startDate={startDate}
          endDate={endDate}
          loading={refreshing || loading}
          title="Finance window"
          description="Window drives backend finance analytics slices for reporting and control routing while transactional posting semantics remain unchanged."
          onWindowChange={setWindowPreset}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />

        {loading ? <LoadingBlock label="Loading finance control center..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load finance control center"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <section className="grid gap-4 xl:grid-cols-4">
              <FinanceLaneCard
                eyebrow="Collections"
                title="Window collections (net)"
                description="Windowed net collections from backend analytics summary with reversal-aware treatment."
                value={money(windowNet)}
                secondaryValue={`${money(cashNet)} cash · ${money(bankNet)} bank · ${money(upiNet)} UPI`}
                primaryHref={ROUTES.admin.payments}
                primaryLabel="Open payments"
                secondaryHref={ROUTES.admin.collections}
                secondaryLabel="Open collections"
                tone="success"
              />

              <FinanceLaneCard
                eyebrow="Receivables"
                title="Outstanding receivables"
                description="Canonical outstanding amount across active contracts with overdue signal retained."
                value={money(outstandingReceivables)}
                secondaryValue={`${money(overdueAmount)} overdue`}
                primaryHref={ROUTES.admin.subscriptions}
                primaryLabel="Open subscriptions"
                secondaryHref={ROUTES.admin.emisOverdue}
                secondaryLabel="Overdue queue"
                tone={overdueAmount > 0 ? "warning" : "default"}
              />

              <FinanceLaneCard
                eyebrow="Reconciliation"
                title="Exception queue"
                description="Reconciliation flags route into controlled exception workflows with audit-safe handling."
                value={String(reconciliationFlags)}
                secondaryValue="Do not mutate payment history directly."
                primaryHref={buildAdminReconciliationRoute({ flagged: true })}
                primaryLabel="Open flagged queue"
                secondaryHref={buildAdminReconciliationRoute()}
                secondaryLabel="Reconciliation"
                tone={reconciliationFlags > 0 ? "warning" : "success"}
              />

              <FinanceLaneCard
                eyebrow="Direct sales"
                title="Retail billing linkage"
                description="Direct-sale trend remains separate from EMI contracts and is linked through billing/accounting routes."
                value={money(directSalesGross)}
                secondaryValue={`${directSalesCount} direct-sale documents in selected window`}
                primaryHref={ROUTES.admin.billingDirectSales}
                primaryLabel="Open direct sales"
                secondaryHref={ROUTES.admin.billingRegister}
                secondaryLabel="Billing register"
                tone="default"
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-4">
              <FinanceLaneCard
                eyebrow="Masters"
                title="Chart of accounts"
                description="Ledger account master used by books, journals, and operational bridge posting."
                value={`${chartAccountCount} chart accounts`}
                secondaryValue="Accounting-side master"
                primaryHref={ROUTES.admin.accountingChartOfAccounts}
                primaryLabel="Open chart of accounts"
                secondaryHref={ROUTES.admin.settingsBusinessSetupChartAccounts}
                secondaryLabel="Business setup chart"
                tone={chartAccountCount > 0 ? "success" : "warning"}
              />

              <FinanceLaneCard
                eyebrow="Masters"
                title="Finance accounts"
                description="Operational cash/bank/UPI accounts for collections, bills, payout, and book routing."
                value={`${financeAccountCount} finance accounts`}
                secondaryValue="Branch-scoped where configured"
                primaryHref={ROUTES.admin.settingsBusinessSetupFinanceAccounts}
                primaryLabel="Open finance accounts"
                secondaryHref={ROUTES.admin.accountingBooks}
                secondaryLabel="Open books"
                tone={financeAccountCount > 0 ? "success" : "warning"}
              />

              <FinanceLaneCard
                eyebrow="Books"
                title="Cash, bank, and UPI books"
                description="Route into book registers for account-facing review without altering payment truth."
                value={money(windowNet)}
                secondaryValue={`${money(cashNet)} cash · ${money(bankNet)} bank · ${money(upiNet)} UPI`}
                primaryHref={ROUTES.admin.accountingBooksCash}
                primaryLabel="Cash book"
                secondaryHref={ROUTES.admin.accountingBooksBank}
                secondaryLabel="Bank book"
                tone="default"
              />

              <FinanceLaneCard
                eyebrow="Procurement"
                title="Purchase bill obligations"
                description="Draft and approved purchase bills waiting controlled posting or settlement follow-through."
                value={`${purchaseQueueCount} active bills`}
                secondaryValue={`${draftPurchaseBills?.count ?? 0} draft · ${approvedPurchaseBills?.count ?? 0} approved`}
                primaryHref={ROUTES.admin.accountingPurchaseBills}
                primaryLabel="Open purchase bills"
                secondaryHref={ROUTES.admin.accountingVendors}
                secondaryLabel="Vendor register"
                tone={purchaseQueueCount > 0 ? "warning" : "success"}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-4">
              <FinanceLaneCard
                eyebrow="Commissions"
                title="Commission register"
                description="Review total partner commission exposure and unsettled register rows."
                value={money(summary?.summary?.total_commission)}
                secondaryValue={`${String(summary?.summary?.pending_count ?? 0)} unsettled · ${String(summary?.summary?.settled_count ?? 0)} settled`}
                primaryHref={ROUTES.admin.financeCommissions}
                primaryLabel="Open commissions"
                secondaryHref={ROUTES.admin.partners}
                secondaryLabel="Partner directory"
                tone="warning"
              />

              <FinanceLaneCard
                eyebrow="Settlement"
                title="Payout queue"
                description="Prepare eligible commission rows for payout batch packaging and review."
                value={money(summary?.summary?.pending_commission)}
                secondaryValue={`${String(Number(summary?.summary?.pending_count ?? 0) + Number(summary?.summary?.settled_count ?? 0))} payout-eligible rows`}
                primaryHref={ROUTES.admin.financeSettledCommissions}
                primaryLabel="Open payout queue"
                secondaryHref={ROUTES.admin.financeCommissions}
                secondaryLabel="Back to register"
                tone="success"
              />

              <FinanceLaneCard
                eyebrow="Payouts"
                title="Payout batches"
                description="Draft, finalized, and cancelled batch visibility for settlement discipline."
                value={String(batches.length)}
                secondaryValue={`${draftBatchCount} draft · ${finalizedBatchCount} finalized · ${cancelledBatchCount} cancelled`}
                primaryHref={ROUTES.admin.financePayoutBatches}
                primaryLabel="Open payout batches"
                tone="default"
              />

              <FinanceLaneCard
                eyebrow="Risk"
                title="Reversed commission value"
                description="Track reversed commission impact separately from pending and settled amounts."
                value={money(summary?.summary?.reversed_commission)}
                secondaryValue={`${String(summary?.summary?.reversed_count ?? 0)} reversed rows`}
                primaryHref={ROUTES.admin.financeCommissions}
                primaryLabel="Review commission risk"
                secondaryHref={buildAdminReconciliationRoute({ view: "payments" })}
                secondaryLabel="Payment reconciliation"
                tone={Number(summary?.summary?.reversed_commission ?? 0) > 0 ? "danger" : "default"}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <SectionCard
                title="Receivables aging"
                description="Backend-prepared aging buckets for pending and overdue receivables pressure."
              >
                {receivableAging.length === 0 ? (
                  <EmptyState
                    title="No aging buckets"
                    description="No pending receivable rows are currently visible."
                  />
                ) : (
                  <div className="space-y-3">
                    {receivableAging.map((row) => (
                      <MiniBar
                        key={row.bucket}
                        label={row.label}
                        value={toNumber(row.amount)}
                        total={Math.max(receivableAgingMax, 1)}
                        amount={`${money(row.amount)} · ${row.count}`}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Direct-sales trend"
                description="Windowed direct-sale gross values from billing-backed source records."
              >
                {directSalesTrend.length === 0 ? (
                  <EmptyState
                    title="No direct-sale trend rows"
                    description="No non-cancelled direct-sale rows are visible in this window."
                  />
                ) : (
                  <div className="space-y-3">
                    {directSalesTrend.slice(-6).map((row) => (
                      <MiniBar
                        key={`${row.date || "na"}-${row.count}`}
                        label={row.date || "Unknown date"}
                        value={toNumber(row.gross_total)}
                        total={Math.max(directSalesTrendMax, 1)}
                        amount={`${money(row.gross_total)} · ${row.count}`}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Finance workflow launchpad"
                description="Every action below routes to an existing operational finance module; no placeholder buttons."
              >
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={ROUTES.admin.accountingChartOfAccounts}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Chart of Accounts
                  </Link>

                  <Link
                    href={ROUTES.admin.settingsBusinessSetupFinanceAccounts}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Finance Accounts
                  </Link>

                  <Link
                    href={ROUTES.admin.accountingBooksCash}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Cash Book
                  </Link>

                  <Link
                    href={ROUTES.admin.accountingBooksBank}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Bank Book
                  </Link>

                  <Link
                    href={ROUTES.admin.accountingBooksUpi}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    UPI Book
                  </Link>

                  <Link
                    href={ROUTES.admin.accountingPurchaseBills}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Purchase Bills
                  </Link>

                  <Link
                    href={ROUTES.admin.billingDirectSales}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Direct Sales
                  </Link>

                  <Link
                    href={buildAdminReconciliationRoute({ flagged: true })}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Reconciliation Flags
                  </Link>

                  <Link
                    href={ROUTES.admin.financeCommissions}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Commission Register
                  </Link>

                  <Link
                    href={ROUTES.admin.financePayoutBatches}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Payout Batches
                  </Link>
                </div>
              </SectionCard>
            </section>

            <SectionCard
              title="Recent payout batches"
              description="Recent payout batch records for finance visibility and downstream detail review."
            >
              {recentBatches.length === 0 ? (
                <EmptyState
                  title="No payout batches"
                  description="No payout batches are currently available."
                />
              ) : (
                <div className="space-y-3">
                  {recentBatches.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="font-medium text-foreground">Batch #{row.id}</div>
                          <div className="mt-1 text-sm text-slate-600">
                            {row.status} · {row.commission_count} commission rows
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            Created {formatDateTime(row.created_at)} · Finalized {" "}
                            {formatDateTime(row.finalized_at)} · Cancelled {" "}
                            {formatDateTime(row.cancelled_at)}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-semibold text-foreground">
                              {money(row.total_amount)}
                            </div>
                            <div className="text-xs text-slate-600">Batch total</div>
                          </div>

                          <Link
                            href={`/admin/finance/payout-batches/${row.id}`}
                            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                          >
                            Open Batch
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
