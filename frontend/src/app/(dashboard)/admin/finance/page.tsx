"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import DashboardTimeWindowSelector from "@/components/dashboard/DashboardTimeWindowSelector";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch, toArray } from "@/lib/api";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  getVendorOperationalSummary,
  listChartOfAccounts,
  listFinanceAccounts,
  listPurchaseBills,
  listVendors,
  type AccountingPaginatedResponse,
  type AccountingPurchaseBill,
  type ChartOfAccount,
  type FinanceAccount,
  type VendorOperationalSummary,
} from "@/services/accounting";
import { listDirectSales, type DirectSale } from "@/services/billing";
import type { DashboardWindowPreset } from "@/services/dashboard-types";
import {
  createFinanceTransfer,
  getFinanceOperationalSummary,
  getReconciliationOverview,
  listFinanceTransfers,
  type FinanceOperationalSummaryResponse,
  type FinanceTransferListResponse,
} from "@/services/finance-operations";
import {
  getAdminPaymentRegister,
  type PaymentRegisterRow,
} from "@/services/payments";
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

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load finance control center.";
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

function MetricCard({
  label,
  value,
  note,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  note: string;
  href?: string;
  tone?: "default" | "warning" | "success" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50/85"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/88"
        : tone === "success"
          ? "border-emerald-200 bg-emerald-50/88"
          : "border-[color-mix(in_oklab,var(--surface-border-strong)_78%,white_22%)] bg-[linear-gradient(180deg,var(--surface-card-elevated),color-mix(in_oklab,var(--surface-card-soft)_84%,var(--surface-muted)_16%))]";

  const content = (
    <div className={`rounded-[1.45rem] border p-4 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.34)] ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{note}</div>
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block transition hover:-translate-y-0.5">
      {content}
    </Link>
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
    <section className="workspace-section-shell surface-panel-elevated rounded-[1.55rem] p-5 shadow-sm">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/75 to-transparent" />
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
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
  const [directSales, setDirectSales] = useState<DirectSale[]>([]);
  const [recentCollections, setRecentCollections] = useState<PaymentRegisterRow[]>([]);
  const [vendorSummaries, setVendorSummaries] = useState<VendorOperationalSummary[]>([]);
  const [financeOperationalSummary, setFinanceOperationalSummary] =
    useState<FinanceOperationalSummaryResponse | null>(null);
  const [reconciliationOverview, setReconciliationOverview] = useState<Awaited<
    ReturnType<typeof getReconciliationOverview>
  > | null>(null);
  const [financeTransfers, setFinanceTransfers] =
    useState<FinanceTransferListResponse | null>(null);
  const [transferForm, setTransferForm] = useState({
    movement_date: new Date().toISOString().slice(0, 10),
    from_finance_account_id: "",
    to_finance_account_id: "",
    amount: "",
    reference_no: "",
    notes: "",
  });
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferNotice, setTransferNotice] = useState<string | null>(null);

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
          directSalesPayload,
          paymentRegisterPayload,
          vendorsPayload,
          financeOperationalPayload,
          reconciliationPayload,
          financeTransferPayload,
        ] = await Promise.all([
          apiFetch<AdminCommissionSummaryResponse>("/admin/commissions/summary/"),
          apiFetch<unknown>("/admin/commission-payout-batches/list/"),
          getAdminAnalyticsSummary(analyticsQuery),
          listChartOfAccounts(),
          listFinanceAccounts(),
          listPurchaseBills({ status: "DRAFT", page_size: 1 }),
          listPurchaseBills({ status: "APPROVED", page_size: 1 }),
          listDirectSales({ outstanding_only: "true", page_size: 6 }),
          getAdminPaymentRegister(),
          listVendors({ page_size: 6 }),
          getFinanceOperationalSummary(),
          getReconciliationOverview(),
          listFinanceTransfers(),
        ]);

        const vendorDetails = await Promise.all(
          vendorsPayload.results.map((vendor) => getVendorOperationalSummary(vendor.id))
        );

        setSummary(summaryPayload);
        setBatches(
          toArray<Record<string, unknown>>(batchesPayload).map(normalizePayoutBatch)
        );
        setAnalytics(analyticsPayload);
        setChartAccounts(chartPayload);
        setFinanceAccounts(financeAccountPayload);
        setDraftPurchaseBills(draftPurchasePayload);
        setApprovedPurchaseBills(approvedPurchasePayload);
        setDirectSales(directSalesPayload.results);
        setRecentCollections(paymentRegisterPayload.results.slice(0, 8));
        setFinanceOperationalSummary(financeOperationalPayload);
        setReconciliationOverview(reconciliationPayload);
        setFinanceTransfers(financeTransferPayload);
        setVendorSummaries(
          vendorDetails.sort(
            (left, right) =>
              toNumber(right.summary.outstanding_payable_total) -
              toNumber(left.summary.outstanding_payable_total)
          )
        );
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
          setDirectSales([]);
          setRecentCollections([]);
          setFinanceOperationalSummary(null);
          setReconciliationOverview(null);
          setFinanceTransfers(null);
          setVendorSummaries([]);
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

  const methodRows = analytics?.payment_method_mix.rows ?? [];
  const cashNet = toNumber(methodRows.find((row) => row.method === "CASH")?.net_amount);
  const bankNet = toNumber(methodRows.find((row) => row.method === "BANK")?.net_amount);
  const upiNet = toNumber(methodRows.find((row) => row.method === "UPI")?.net_amount);
  const windowNet = toNumber(analytics?.overview.window_net_collections);
  const outstandingReceivables = toNumber(analytics?.overview.outstanding_amount);
  const overdueAmount = toNumber(analytics?.overview.overdue_emi_amount);
  const reconciliationFlags = toNumber(analytics?.overview.reconciliation_flagged_count);
  const chartAccountCount = chartAccounts?.count ?? 0;
  const financeAccountCount = financeAccounts?.count ?? 0;
  const transferAccountOptions = financeAccounts?.results ?? [];
  const purchaseQueueCount =
    (draftPurchaseBills?.count ?? 0) + (approvedPurchaseBills?.count ?? 0);

  const receivableAging = analytics?.receivables_pressure.aging ?? [];
  const receivableAgingMax = receivableAging.reduce(
    (max, row) => Math.max(max, toNumber(row.amount)),
    0
  );

  const directSalesGross = toNumber(analytics?.direct_sales_posture.summary.gross_total);
  const directSalesCount = analytics?.direct_sales_posture.summary.count ?? 0;
  const directSalesOutstandingTotal = useMemo(
    () => directSales.reduce((sum, row) => sum + toNumber(row.balance_total), 0),
    [directSales]
  );
  const supplierPayableTotal = useMemo(
    () =>
      vendorSummaries.reduce(
        (sum, row) => sum + toNumber(row.summary.outstanding_payable_total),
        0
      ),
    [vendorSummaries]
  );
  const draftBatchCount = useMemo(
    () => batches.filter((row) => row.status.toUpperCase() === "DRAFT").length,
    [batches]
  );
  const recentBatches = useMemo(() => batches.slice(0, 4), [batches]);
  const pendingSettlementAmount = toNumber(
    reconciliationOverview?.pending_settlement_amount
  );
  const unappliedAdvanceTotal = toNumber(
    reconciliationOverview?.unapplied_advance_total
  );
  const pendingSettlementAccounts =
    reconciliationOverview?.pending_finance_accounts ?? 0;
  const flaggedOperationalReconciliations =
    reconciliationOverview?.flagged_reconciliation_count ?? reconciliationFlags;
  const operationalRows = financeOperationalSummary?.results ?? [];

  async function handleCreateTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTransferNotice(null);
    setError(null);

    if (!transferForm.from_finance_account_id || !transferForm.to_finance_account_id) {
      setError("Select both source and destination finance accounts.");
      return;
    }

    if (transferForm.from_finance_account_id === transferForm.to_finance_account_id) {
      setError("Source and destination finance accounts must be different.");
      return;
    }

    if (!transferForm.amount.trim() || Number(transferForm.amount) <= 0) {
      setError("Transfer amount must be greater than zero.");
      return;
    }

    setTransferSubmitting(true);

    try {
      const created = await createFinanceTransfer({
        movement_date: transferForm.movement_date,
        from_finance_account_id: Number(transferForm.from_finance_account_id),
        to_finance_account_id: Number(transferForm.to_finance_account_id),
        amount: transferForm.amount,
        reference_no: transferForm.reference_no.trim() || undefined,
        notes: transferForm.notes.trim() || undefined,
      });
      setTransferNotice(`Transfer ${created.movement_no} posted successfully.`);
      setTransferForm({
        movement_date: new Date().toISOString().slice(0, 10),
        from_finance_account_id: "",
        to_finance_account_id: "",
        amount: "",
        reference_no: "",
        notes: "",
      });
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setTransferSubmitting(false);
    }
  }

  return (
    <PortalPage
      eyebrow="Finance Control"
      title="Finance Control Center"
      subtitle="Admin finance operations view for customer receivables, supplier payables, direct-sale recovery, subscription collections, account mix, and reconciliation-sensitive review."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Finance" },
      ]}
      stats={[
        {
          label: "Window Net",
          value: money(windowNet),
          tone: "success",
        },
        {
          label: "Customer Receivables",
          value: money(outstandingReceivables),
          tone: outstandingReceivables > 0 ? "warning" : "success",
        },
        {
          label: "Direct-Sale Unpaid",
          value: money(directSalesOutstandingTotal),
          tone: directSalesOutstandingTotal > 0 ? "warning" : "success",
        },
        {
          label: "Supplier Payables",
          value: money(supplierPayableTotal),
          tone: supplierPayableTotal > 0 ? "warning" : "success",
        },
        {
          label: "Reconciliation Flags",
          value: String(reconciliationFlags),
          tone: reconciliationFlags > 0 ? "warning" : "info",
        },
      ]}
      statusBadge={{
        label: "Finance Operations",
        tone: "info",
      }}
      maxWidth={1440}
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
          description="Window changes analytics slices only. Transaction posting, receipts, and ledgers continue to use the existing controlled services."
          onWindowChange={setWindowPreset}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />

        <section className="workspace-section-shell surface-panel-elevated rounded-[1.55rem] p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Finance quick lanes</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Fast access to reconciliation, receivables/payables, and controlled posting surfaces without mixing EMI collection into finance lanes.
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Link
              href={buildAdminReconciliationRoute({ flagged: true })}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Reconciliation queue
            </Link>
            <Link
              href={ROUTES.admin.accountingVendors}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Vendor payables
            </Link>
            <Link
              href={ROUTES.admin.payments}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Payment register
            </Link>
            <Link
              href="/admin/finance/deposits"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Rent/Lease deposits
            </Link>
          </div>
        </section>

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
            <ControlLaneGrid
              title="Finance control lanes"
              description="Accounting and finance remain distinct from EMI collection. These lanes route operators into the dedicated registers for account structure, account control, posting, reconciliation, payables or receivables, exports, and period governance."
              lanes={[
                {
                  title: "Account structure",
                  description: "Chart of accounts and finance-account setup for operational finance control.",
                  href: ROUTES.admin.accountingChartOfAccounts,
                  badge: "Setup",
                },
                {
                  title: "Cash / Bank / UPI control",
                  description: "Finance-account mix, transfers, and operational account posture without merging cashier collection screens.",
                  href: ROUTES.admin.finance,
                  badge: "Accounts",
                  detail: "Use this lane for account mix and transfer visibility only.",
                },
                {
                  title: "Posting & journals",
                  description: "Manual journals and controlled posting stay in accounting, not inside the collection workflow.",
                  href: ROUTES.admin.accountingJournals,
                  badge: "Posting",
                },
                {
                  title: "Reconciliation",
                  description: "Investigate subscription and payment deltas before closing or settlement.",
                  href: buildAdminReconciliationRoute({ flagged: true }),
                  badge: "Risk",
                },
                {
                  title: "Receivables / payables",
                  description: "Customer receivables and vendor payables remain explicit and separately auditable.",
                  href: ROUTES.admin.accountingVendors,
                  badge: "Ledger",
                },
                {
                  title: "Tax / billing / exports",
                  description: "Open billing, GST, and export surfaces without collapsing them into finance review.",
                  href: ROUTES.admin.billing,
                  badge: "Compliance",
                },
                {
                  title: "Period / controls",
                  description: "Close governance, periods, and admin accounting controls.",
                  href: ROUTES.admin.accountingPeriods,
                  badge: "Close",
                },
                {
                  title: "EMI collection lane",
                  description: "Customer EMI and cashier collection remain a separate operational lane by design.",
                  href: ROUTES.admin.collections,
                  badge: "Separate",
                },
              ]}
            />
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Customer Receivables"
                value={money(outstandingReceivables)}
                note={`${money(overdueAmount)} overdue EMI`}
                href={ROUTES.admin.collections}
                tone={overdueAmount > 0 ? "warning" : "default"}
              />
              <MetricCard
                label="Direct Sale Unpaid"
                value={money(directSalesOutstandingTotal)}
                note={`${directSales.length} receivable bills`}
                href={`${ROUTES.admin.paymentsCreate}?workflow=direct-sale`}
                tone={directSalesOutstandingTotal > 0 ? "warning" : "default"}
              />
              <MetricCard
                label="Supplier Payables"
                value={money(supplierPayableTotal)}
                note={`${vendorSummaries.length} supplier summaries`}
                href={ROUTES.admin.accountingVendors}
                tone={supplierPayableTotal > 0 ? "warning" : "default"}
              />
              <MetricCard
                label="Payment Account Mix"
                value={money(windowNet)}
                note={`${money(cashNet)} cash · ${money(bankNet)} bank · ${money(upiNet)} UPI`}
                href={ROUTES.admin.payments}
                tone="success"
              />
              <MetricCard
                label="Reconciliation Queue"
                value={String(reconciliationFlags)}
                note={`${draftBatchCount} draft payout batches`}
                href={buildAdminReconciliationRoute({ flagged: true })}
                tone={reconciliationFlags > 0 ? "danger" : "success"}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
              <SectionCard
                title="Operational settlement posture"
                description="These cards use the new backend reconciliation overview and finance-account operational summary so pending clearing, unapplied customer money, and settlement-sensitive accounts stay visible without changing the underlying payment truth."
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard
                    label="Pending Settlement"
                    value={money(pendingSettlementAmount)}
                    note={`${pendingSettlementAccounts} finance accounts still carrying unsettled value`}
                    href={buildAdminReconciliationRoute({ flagged: true })}
                    tone={pendingSettlementAmount > 0 ? "warning" : "success"}
                  />
                  <MetricCard
                    label="Unapplied Advances"
                    value={money(unappliedAdvanceTotal)}
                    note="Customer money collected but not yet allocated to a receivable rail"
                    tone={unappliedAdvanceTotal > 0 ? "warning" : "success"}
                  />
                  <MetricCard
                    label="Flagged Finance Items"
                    value={String(flaggedOperationalReconciliations)}
                    note="Reconciliation items needing finance review or exception follow-up"
                    href={buildAdminReconciliationRoute({ view: "payments", flagged: true })}
                    tone={flaggedOperationalReconciliations > 0 ? "danger" : "success"}
                  />
                </div>

                <div className="mt-5 space-y-3">
                  {operationalRows.length === 0 ? (
                    <EmptyState
                      title="No operational finance summary"
                      description="No finance accounts are available for settlement posture review."
                    />
                  ) : (
                    operationalRows.slice(0, 6).map((row) => (
                      <div
                        key={row.finance_account_id}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {row.finance_account_name} · {row.kind}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              Chart {row.chart_account_code} · Branch {row.branch_name || "Shared"} · Payments {money(row.payment_total)} · Advances {money(row.advance_total)}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={[
                                "rounded-full px-3 py-1 text-xs font-semibold",
                                row.reconciliation_status === "PENDING"
                                  ? "border border-amber-200 bg-amber-50 text-amber-900"
                                  : "border border-emerald-200 bg-emerald-50 text-emerald-800",
                              ].join(" ")}
                            >
                              {row.reconciliation_status}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                              Pending {money(row.pending_settlement_amount)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                              Unapplied {money(row.unapplied_advance_total)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </SectionCard>

              <SectionCard
                title="Admin finance transfer"
                description="Create a first-class transfer between finance accounts. This uses the new backend finance transfer endpoint and keeps source/destination validation, posting, and auditability on the server."
              >
                {transferNotice ? (
                  <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {transferNotice}
                  </div>
                ) : null}

                <form className="grid gap-3" onSubmit={handleCreateTransfer}>
                  <label className="text-sm text-muted-foreground">
                    Movement date
                    <input
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                      type="date"
                      value={transferForm.movement_date}
                      onChange={(event) =>
                        setTransferForm((current) => ({
                          ...current,
                          movement_date: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>

                  <label className="text-sm text-muted-foreground">
                    From finance account
                    <select
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                      value={transferForm.from_finance_account_id}
                      onChange={(event) =>
                        setTransferForm((current) => ({
                          ...current,
                          from_finance_account_id: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select source</option>
                      {transferAccountOptions
                        .filter((account) => account.is_active)
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} · {account.kind}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="text-sm text-muted-foreground">
                    To finance account
                    <select
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                      value={transferForm.to_finance_account_id}
                      onChange={(event) =>
                        setTransferForm((current) => ({
                          ...current,
                          to_finance_account_id: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select destination</option>
                      {transferAccountOptions
                        .filter((account) => account.is_active)
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} · {account.kind}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="text-sm text-muted-foreground">
                    Amount
                    <input
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={transferForm.amount}
                      onChange={(event) =>
                        setTransferForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>

                  <label className="text-sm text-muted-foreground">
                    Reference no
                    <input
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                      value={transferForm.reference_no}
                      onChange={(event) =>
                        setTransferForm((current) => ({
                          ...current,
                          reference_no: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="text-sm text-muted-foreground">
                    Notes
                    <textarea
                      className="mt-1 min-h-[96px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                      value={transferForm.notes}
                      onChange={(event) =>
                        setTransferForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={transferSubmitting}
                      className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {transferSubmitting ? "Posting transfer..." : "Post Transfer"}
                    </button>
                    <Link
                      href={ROUTES.admin.accountingBooks}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                    >
                      Open Books
                    </Link>
                  </div>
                </form>

                <div className="mt-5 space-y-3">
                  {(financeTransfers?.results ?? []).slice(0, 5).map((transfer) => (
                    <div
                      key={transfer.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {transfer.movement_no}
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            {transfer.from_finance_account_name} → {transfer.to_finance_account_name} · {formatDate(transfer.movement_date)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-900">
                            {money(transfer.amount)}
                          </div>
                          <div className="mt-1 text-xs text-slate-600">{transfer.status}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <SectionCard
                title="Receivables and posting control"
                description="Customer dues stay split by rail, but the posting surface remains controlled through existing collection, receipt, and finance-account workflows."
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-medium text-slate-700">Subscription overdue</span>
                    <span className="font-semibold text-slate-900">{money(overdueAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-medium text-slate-700">Direct-sale unpaid</span>
                    <span className="font-semibold text-slate-900">{money(directSalesOutstandingTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-medium text-slate-700">Recent net collection</span>
                    <span className="font-semibold text-emerald-700">{money(windowNet)}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Link
                      href={ROUTES.admin.collections}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                    >
                      Collections Workspace
                    </Link>
                    <Link
                      href={ROUTES.admin.payments}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                    >
                      Payment Register
                    </Link>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Supplier payable and books"
                description="Vendor settlements, purchase bills, and finance accounts remain aligned through the current accounting posting paths."
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-medium text-slate-700">Purchase bill queue</span>
                    <span className="font-semibold text-slate-900">{purchaseQueueCount}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-medium text-slate-700">Chart of accounts</span>
                    <span className="font-semibold text-slate-900">{chartAccountCount}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-medium text-slate-700">Finance accounts</span>
                    <span className="font-semibold text-slate-900">{financeAccountCount}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Link
                      href={ROUTES.admin.accountingPurchaseBills}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                    >
                      Purchase Bills
                    </Link>
                    <Link
                      href={ROUTES.admin.accountingVendors}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                    >
                      Vendor Ledger View
                    </Link>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Payment method mix"
                description="Collections remain traceable by operational finance account without changing the underlying payment truth."
              >
                <div className="space-y-3">
                  <MiniBar
                    label="Cash"
                    value={cashNet}
                    total={Math.max(windowNet, 1)}
                    amount={money(cashNet)}
                  />
                  <MiniBar
                    label="Bank"
                    value={bankNet}
                    total={Math.max(windowNet, 1)}
                    amount={money(bankNet)}
                  />
                  <MiniBar
                    label="UPI"
                    value={upiNet}
                    total={Math.max(windowNet, 1)}
                    amount={money(upiNet)}
                  />
                </div>
              </SectionCard>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <SectionCard
                title="Direct-sale unpaid recovery"
                description="These bills already use the controlled direct-sale collection path. Admin can collect from the finance rail and cashier can continue counter recovery through the cashier flow."
              >
                {directSales.length === 0 ? (
                  <EmptyState
                    title="No direct-sale receivables"
                    description="No outstanding invoiced direct-sale bills are waiting for recovery."
                  />
                ) : (
                  <div className="space-y-3">
                    {directSales.map((sale) => (
                      <div
                        key={sale.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {sale.sale_no || `SALE-${sale.id}`} · {sale.customer_name || sale.customer_name_snapshot || "Walk-in customer"}
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                              Invoice {sale.billing_invoice_no || "—"} · {formatDate(sale.sale_date)} · Collected {money(sale.received_total)}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              Finance account {sale.finance_account_name || "Not tagged"} · Branch {sale.branch_name || sale.branch_code || "Primary branch"}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                              Outstanding {money(sale.balance_total)}
                            </div>
                            <Link
                              href={`${ROUTES.admin.paymentsCreate}?workflow=direct-sale&direct_sale=${sale.id}`}
                              className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                            >
                              Collect
                            </Link>
                            <Link
                              href={`${ROUTES.admin.billingDirectSales}?focus_sale=${sale.id}`}
                              className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                            >
                              Open Sale
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Recent collections"
                description="Recent payment register rows give finance visibility into posting method, customer, subscription linkage, and reversal-safe review."
              >
                {recentCollections.length === 0 ? (
                  <EmptyState
                    title="No recent collections"
                    description="No payment register rows are visible right now."
                  />
                ) : (
                  <div className="space-y-3">
                    {recentCollections.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {row.customer_name || "Unassigned customer"} · {money(row.amount)}
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                              {row.method || "Unknown method"} · {formatDate(row.payment_date)} · Collected by {row.collected_by_username || "System"}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              Subscription {row.subscription_number || row.subscription || "—"} · Branch {row.branch_name || row.branch_code || "—"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {row.is_reversed ? (
                              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">
                                Reversed
                              </span>
                            ) : (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                                Active
                              </span>
                            )}
                            <Link
                              href={ROUTES.admin.payments}
                              className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                            >
                              Register
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <SectionCard
                title="Receivables aging"
                description="Backend-prepared aging buckets keep overdue subscription exposure visible without changing the underlying EMI ledger rules."
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
                title="Supplier payable visibility"
                description="Vendor operational summaries stay separate from customer ledgers while remaining visible from the same finance control surface."
              >
                {vendorSummaries.length === 0 ? (
                  <EmptyState
                    title="No supplier summaries"
                    description="No vendor summaries are available yet."
                  />
                ) : (
                  <div className="space-y-3">
                    {vendorSummaries.map((vendor) => (
                      <div
                        key={vendor.vendor.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{vendor.vendor.name}</div>
                            <div className="mt-1 text-xs text-slate-600">
                              {vendor.summary.posted_purchase_bill_count} posted purchase bills · {vendor.summary.posted_settlement_count} posted settlements
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-amber-900">
                              {money(vendor.summary.outstanding_payable_total)}
                            </div>
                            <Link
                              href={`${ROUTES.admin.accountingVendors}?vendor=${vendor.vendor.id}`}
                              className="mt-1 inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                            >
                              Open Vendor
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Reconciliation and payout discipline"
                description="Finance exceptions, commission exposure, and payout batches stay visible without bypassing the current audit-safe workflows."
              >
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Reconciliation flags</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{reconciliationFlags}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Pending commission exposure</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {money(summary?.summary?.pending_commission)}
                    </div>
                  </div>
                  {recentBatches.length === 0 ? (
                    <EmptyState
                      title="No payout batches"
                      description="No payout batches are currently available."
                    />
                  ) : (
                    <div className="space-y-2">
                      {recentBatches.map((row) => (
                        <div
                          key={row.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">Batch #{row.id}</div>
                              <div className="mt-1 text-xs text-slate-600">
                                {row.status} · {row.commission_count} commission rows
                              </div>
                            </div>
                            <div className="text-right text-xs text-slate-600">
                              <div className="font-semibold text-slate-900">{money(row.total_amount)}</div>
                              <div>{formatDateTime(row.created_at)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Link
                      href={buildAdminReconciliationRoute({ flagged: true })}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                    >
                      Flagged Queue
                    </Link>
                    <Link
                      href={ROUTES.admin.financePayoutBatches}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                    >
                      Payout Batches
                    </Link>
                  </div>
                </div>
              </SectionCard>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <SectionCard
                title="Direct-sale rail and subscription rail"
                description="Finance review keeps both sales rails visible without collapsing them into a single posting model."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Direct Sale</div>
                    <div className="mt-2 text-xl font-semibold text-slate-900">{money(directSalesGross)}</div>
                    <div className="mt-1 text-sm text-slate-600">{directSalesCount} direct-sale documents in selected window</div>
                    <Link
                      href={ROUTES.admin.billingDirectSales}
                      className="mt-3 inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                    >
                      Open Direct Sale
                    </Link>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Subscription Sale</div>
                    <div className="mt-2 text-xl font-semibold text-slate-900">{money(outstandingReceivables)}</div>
                    <div className="mt-1 text-sm text-slate-600">{money(overdueAmount)} overdue from EMI side</div>
                    <Link
                      href={ROUTES.admin.subscriptions}
                      className="mt-3 inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                    >
                      Open Subscriptions
                    </Link>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Ledger review routes"
                description="Use the existing route-specific ledgers and books for detailed review. This page only unifies visibility and routing across the real posting surfaces."
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <Link
                    href={ROUTES.admin.accountingBooksCash}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Cash Book
                  </Link>
                  <Link
                    href={ROUTES.admin.accountingBooksBank}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Bank Book
                  </Link>
                  <Link
                    href={ROUTES.admin.accountingBooksUpi}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    UPI Book
                  </Link>
                  <Link
                    href={ROUTES.admin.accountingChartOfAccounts}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Chart of Accounts
                  </Link>
                </div>
              </SectionCard>
            </section>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
