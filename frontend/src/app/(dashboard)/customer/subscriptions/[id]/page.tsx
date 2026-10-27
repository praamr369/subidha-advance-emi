"use client";

import { formatRupee } from "@/lib/utils/currency";
import { RefreshCw, Camera, ExternalLink } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import CustomerProductLink from "@/components/customers/CustomerProductInspectModal";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import CustomerPageShell, {
  CPageCard,
  CPageSection,
  CPageStats,
  CPageStat,
} from "@/components/layout/CustomerPageShell";
import {
  buildSubscriptionDetailSemantics,
  formatLuckyNumberLabel,
  formatWinnerMonthLabel,
} from "@/domains/subscriptions/detail/view-model";
import { formatPlanTypeLabel } from "@/lib/plan-labels";
import ProductAttributeBadges from "@/components/ui/ProductAttributeBadges";
import {
  getCustomerSubscription,
  listCustomerSubscriptions,
  type CustomerEmi,
} from "@/services/customer";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function cleanProductTitle(name?: string | null): string {
  if (!name) return "";
  return name.replace(/\s*\([^)]+:[^)]+\)\s*$/i, "").trim() || name;
}

type EmiRow = {
  id: number;
  month_no: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  waived_amount: number;
  outstanding_amount: number;
  status: string;
};

function resolveEmiBadge(row: EmiRow): { status: string; label: string } {
  const raw = row.status.toUpperCase();
  if (raw === "PAID") return { status: "PAID", label: "Paid" };
  if (raw === "WAIVED") return { status: "WAIVED", label: "Waived" };
  if (row.outstanding_amount > 0 && row.due_date) {
    const dueTs = Date.parse(row.due_date);
    if (!Number.isNaN(dueTs) && dueTs < Date.now()) return { status: "OVERDUE", label: "Overdue" };
  }
  if (raw === "PENDING") return { status: "PENDING", label: "Pending" };
  return { status: raw || "PENDING", label: raw ? raw.replaceAll("_", " ") : "Pending" };
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">{label}</span>
      <span className="text-sm font-semibold text-foreground text-right max-w-[60%] break-words">{value}</span>
    </div>
  );
}

export default function CustomerSubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const subscriptionId = params?.id;

  const query = useQuery({
    queryKey: ["customerSubscriptionDetail", subscriptionId],
    queryFn: async () => {
      if (!subscriptionId) throw new Error("Missing subscription id.");
      try {
        return await getCustomerSubscription(subscriptionId);
      } catch (primaryError) {
        const listPayload = await listCustomerSubscriptions();
        const fallback = listPayload.results.find((item) => String(item.id) === String(subscriptionId));
        if (!fallback) throw primaryError;
        return fallback;
      }
    },
    enabled: !!subscriptionId,
  });

  const subscription = query.data || null;
  const loading = query.isLoading;
  const refreshing = query.isFetching && !query.isLoading;
  const error = query.error ? (query.error as Error).message : null;

  const loadPage = useCallback(async () => { await query.refetch(); }, [query]);

  const isRentOrLease =
    subscription?.plan_type === "RENT" || subscription?.plan_type === "LEASE";

  const emis = useMemo<CustomerEmi[]>(() => (
    Array.isArray(subscription?.emis) ? (subscription?.emis as CustomerEmi[]) : []
  ), [subscription]);

  const emiRows = useMemo<EmiRow[]>(() => {
    if (emis.length > 0) {
      return emis.map((emi, index) => {
        const amount = toNumber(emi.amount);
        const paidAmount = toNumber(emi.paid_amount);
        const waivedAmount = toNumber(emi.waived_amount);
        const computedOutstanding = Math.max(amount - paidAmount - waivedAmount, 0);
        return {
          id: emi.id ?? index + 1,
          month_no: toNumber(emi.month_no ?? emi.sequence_no ?? index + 1),
          due_date: text(emi.due_date, ""),
          amount,
          paid_amount: paidAmount,
          waived_amount: waivedAmount,
          outstanding_amount: emi.outstanding_amount !== undefined && emi.outstanding_amount !== null && String(emi.outstanding_amount) !== ""
            ? toNumber(emi.outstanding_amount)
            : computedOutstanding,
          status: text(emi.status, "—"),
        };
      });
    }

    if (isRentOrLease && Array.isArray(subscription?.rent_lease_demands) && subscription.rent_lease_demands.length > 0) {
      return subscription.rent_lease_demands
        .filter((d) => d.demand_type !== "SECURITY_DEPOSIT")
        .map((d, index) => {
          const amount = toNumber(d.amount);
          const paidAmount = toNumber(d.paid_amount);
          const outstanding = Math.max(amount - paidAmount, 0);
          return {
            id: d.id ?? index + 1,
            month_no: index + 1,
            due_date: text(d.due_date, ""),
            amount,
            paid_amount: paidAmount,
            waived_amount: 0,
            outstanding_amount: outstanding,
            status: text(d.status, "PENDING"),
          };
        });
    }

    return [];
  }, [emis, isRentOrLease, subscription?.rent_lease_demands]);

  const derivedFinancialSummary = useMemo(() => ({
    emi_total: emiRows.reduce((sum, row) => sum + row.amount, 0),
    paid_amount: emiRows.reduce((sum, row) => sum + row.paid_amount, 0),
    waived_amount: emiRows.reduce((sum, row) => sum + row.waived_amount, 0),
    outstanding_amount: emiRows.reduce((sum, row) => sum + row.outstanding_amount, 0),
  }), [emiRows]);

  const financialSummary = useMemo(() => {
    const backendSummary = subscription?.financial_summary;
    const hasBackendValues = backendSummary && [
      backendSummary.emi_total, backendSummary.paid_amount,
      backendSummary.waived_amount, backendSummary.outstanding_amount,
    ].some((v) => v !== null && v !== undefined && String(v).trim() !== "");
    if (hasBackendValues) {
      return {
        emi_total: backendSummary?.emi_total != null ? toNumber(backendSummary.emi_total) : derivedFinancialSummary.emi_total,
        paid_amount: backendSummary?.paid_amount != null ? toNumber(backendSummary.paid_amount) : derivedFinancialSummary.paid_amount,
        waived_amount: backendSummary?.waived_amount != null ? toNumber(backendSummary.waived_amount) : derivedFinancialSummary.waived_amount,
        outstanding_amount: backendSummary?.outstanding_amount != null ? toNumber(backendSummary.outstanding_amount) : derivedFinancialSummary.outstanding_amount,
      };
    }
    return derivedFinancialSummary;
  }, [subscription, derivedFinancialSummary]);

  const paidEmiCount = useMemo(() => emiRows.filter((r) => r.status.toUpperCase() === "PAID").length, [emiRows]);
  const pendingEmiCount = useMemo(() => emiRows.filter((r) => r.status.toUpperCase() === "PENDING").length, [emiRows]);
  const waivedEmiCount = useMemo(() => emiRows.filter((r) => r.status.toUpperCase() === "WAIVED").length, [emiRows]);

  const winnerSummary = subscription?.winner_summary;

  const itemsDepositTotal = useMemo(() => {
    if (Array.isArray(subscription?.contract_items)) {
      return subscription.contract_items.reduce(
        (sum, it) => sum + toNumber(it.security_deposit_amount),
        0
      );
    }
    return 0;
  }, [subscription?.contract_items]);

  const effectiveSecurityDepositAmount = useMemo(() => {
    const direct = toNumber(subscription?.security_deposit_amount);
    if (direct > 0) return direct;
    if (itemsDepositTotal > 0) return itemsDepositTotal;
    const snap = toNumber((subscription?.pricing_snapshot as Record<string, unknown> | undefined)?.security_deposit_amount);
    if (snap > 0) return snap;
    return direct;
  }, [subscription?.security_deposit_amount, itemsDepositTotal, subscription?.pricing_snapshot]);

  const effectiveRefundableDeposit = useMemo(() => {
    const direct = toNumber(subscription?.refundable_security_deposit);
    if (direct > 0) return direct;
    return effectiveSecurityDepositAmount;
  }, [subscription?.refundable_security_deposit, effectiveSecurityDepositAmount]);

  const hasSecurityDeposit =
    isRentOrLease ||
    effectiveSecurityDepositAmount > 0;

  const detailSemantics = useMemo(() => buildSubscriptionDetailSemantics({
    contractStatus: subscription?.status,
    winnerStatus: winnerSummary?.winner_status ?? subscription?.winner_status,
    winnerMonth: winnerSummary?.winner_month ?? subscription?.winner_month,
    luckyNumber: winnerSummary?.lucky_number ?? subscription?.lucky_number,
    drawId: winnerSummary?.draw_id,
    drawMonth: winnerSummary?.draw_month,
    drawRevealedAt: winnerSummary?.draw_revealed_at,
    waiverScope: winnerSummary?.waiver_scope,
    waivedEmiCount: winnerSummary?.waived_emi_count ?? subscription?.waived_emi_count ?? waivedEmiCount,
    waivedAmount: winnerSummary?.waived_amount ?? financialSummary.waived_amount ?? subscription?.waived_amount,
    outstandingAmount: financialSummary.outstanding_amount,
  }), [financialSummary, subscription, winnerSummary, waivedEmiCount]);

  return (
    <CustomerPageShell
      title={subscription?.subscription_number || `SUB-${subscriptionId || ""}`}
      subtitle={
        subscription?.contract_items && subscription.contract_items.length > 1
          ? `${subscription.contract_items.length} Furniture Items: ${subscription.contract_items.map((it) => cleanProductTitle(it.product_name)).join(", ")}`
          : cleanProductTitle(subscription?.product_name) || "Subscription details"
      }
      backHref="/customer/subscriptions"
      backLabel="Subscriptions"
      actions={
        <button
          type="button"
          onClick={() => void loadPage()}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      {loading ? <ERPLoadingState label="Loading subscription…" /> : null}
      {!loading && error ? (
        <ERPErrorState title="Unable to load subscription" description={error} onRetry={() => void loadPage()} />
      ) : null}
      {!loading && !error && !subscription ? (
        <ERPEmptyState title="Subscription not found" description="No customer subscription record was returned." />
      ) : null}

      {!loading && !error && subscription ? (
        <>
          {/* Financial stats */}
          <CPageStats>
            <CPageStat label="Outstanding" value={formatRupee(financialSummary.outstanding_amount)} tone={detailSemantics.isSettled ? "success" : "warning"} />
            <CPageStat label={isRentOrLease ? "Paid Months" : "Paid EMIs"} value={paidEmiCount} tone={paidEmiCount > 0 ? "success" : "default"} />
            <CPageStat label={isRentOrLease ? "Total Months" : "Total EMIs"} value={emiRows.length || subscription.tenure_months || 0} />
            <CPageStat label="Pending" value={pendingEmiCount} tone={pendingEmiCount > 0 ? "warning" : "success"} />
            {hasSecurityDeposit ? (
              <CPageStat label="Security Deposit" value={formatRupee(effectiveSecurityDepositAmount)} tone="info" />
            ) : null}
            <CPageStat label="Tenure" value={subscription.tenure_months ? `${subscription.tenure_months} Mo` : "—"} />
          </CPageStats>

          {/* Quick links */}
          <CPageSection>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/customer/payments?subscription=${subscription.id}`}
                className="flex h-10 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground transition active:scale-95"
              >
                View Payments
              </Link>
              <Link
                href={`/customer/deliveries?subscription=${subscription.id}`}
                className="flex h-10 items-center justify-center rounded-xl border border-border bg-card text-xs font-bold text-foreground transition active:scale-95"
              >
                View Deliveries
              </Link>
              {subscription.product ? (
                <Link
                  href={`/customer/catalog/${subscription.product}`}
                  className="col-span-2 flex h-10 items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 text-xs font-bold text-primary transition hover:bg-primary/10 active:scale-95"
                >
                  <Camera className="size-4" />
                  <span>Inspect Product Photos & Gallery</span>
                </Link>
              ) : null}
              {subscription.plan_type === "RENT" || subscription.plan_type === "LEASE" ? (
                <Link
                  href={`/customer/contract-amendments/new?source_id=${subscription.id}&contract_type=RENT_LEASE&amendment_type=TENURE_EXTENSION`}
                  className="col-span-2 flex h-10 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-xs font-bold text-primary transition hover:bg-primary/20 active:scale-95"
                >
                  Extend Contract Tenure / Amend
                </Link>
              ) : null}
            </div>
          </CPageSection>

          {/* Contract Digital Signature Section */}
          <CPageSection title="Contract Digital Signature">
            <CPageCard>
              {subscription.has_customer_signature ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-xs font-semibold">
                        ✓ Contract Digitally Signed
                      </span>
                    </div>
                    {subscription.customer_signature_signed_at ? (
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateTime(subscription.customer_signature_signed_at)}
                      </span>
                    ) : null}
                  </div>
                  {subscription.customer_signature_url ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
                      <div>
                        <div className="text-xs font-semibold text-foreground">Signature on File</div>
                        <div className="text-[11px] text-muted-foreground">
                          Attached to your official print contract
                        </div>
                      </div>
                      <div className="flex h-12 w-28 items-center justify-center rounded-lg border border-border bg-white p-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={subscription.customer_signature_url}
                          alt="Customer signature"
                          className="max-h-10 max-w-full object-contain filter contrast-125"
                        />
                      </div>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Your digital signature is recorded with timestamp and securely bound to your Subidha agreement.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      ⏳ Digital Signature Pending
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This contract requires your digital signature to complete onboarding. You can review the contract terms and sign directly from your smartphone or tablet.
                  </p>
                  {subscription.signing_path ? (
                    <Link
                      href={subscription.signing_path}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700 active:scale-95"
                    >
                      <span>✍</span>
                      <span>Review & Sign Contract Now</span>
                    </Link>
                  ) : null}
                </div>
              )}
            </CPageCard>
          </CPageSection>

          {/* Contract info */}
          <CPageSection title="Contract Details">
            <CPageCard>
              <InfoRow label="Status" value={<ERPStatusBadge status={subscription.status} />} />
              {subscription.contract_items && subscription.contract_items.length > 1 ? (
                <InfoRow
                  label="Products"
                  value={
                    <span className="font-semibold text-primary">
                      {subscription.contract_items.length} Attached Furniture Items
                    </span>
                  }
                />
              ) : (
                <InfoRow
                  label="Product"
                  value={
                    <div className="space-y-1.5 flex flex-col items-end">
                      <CustomerProductLink
                        productId={subscription.product}
                        productName={cleanProductTitle(subscription.product_name)}
                        productImage={subscription.product_image}
                        productCode={subscription.product_code}
                        showThumbnail
                        thumbnailSize="sm"
                        inspectButtonLabel="Inspect Gallery"
                      />
                      <ProductAttributeBadges nameFallback={subscription.product_name} size="xs" />
                    </div>
                  }
                />
              )}
              <InfoRow label="Plan type" value={formatPlanTypeLabel(subscription.plan_type)} />
              <InfoRow label="Contract Tenure" value={subscription.tenure_months ? `${subscription.tenure_months} Months` : "—"} />
              <InfoRow label="Monthly Installment" value={formatRupee(subscription.monthly_amount)} />
              <InfoRow label="Total Contract Value" value={formatRupee(subscription.total_amount)} />
              <InfoRow label="Start date" value={formatDate(subscription.start_date)} />
              {subscription.plan_type === "EMI" && subscription.batch_code ? (
                <InfoRow label="Batch" value={text(subscription.batch_code)} />
              ) : null}
              {subscription.plan_type === "EMI" && subscription.lucky_number != null ? (
                <InfoRow label="Lucky number" value={formatLuckyNumberLabel(subscription.lucky_number)} />
              ) : null}
              <InfoRow label="Next due" value={formatDate(subscription.next_due_date)} />
              <InfoRow label="Created" value={formatDate(subscription.created_at)} />
            </CPageCard>
          </CPageSection>

          {/* Multi-product attached furniture section */}
          {subscription.contract_items && subscription.contract_items.length > 0 ? (
            <CPageSection title={`Rented Furniture Products (${subscription.contract_items.length})`}>
              <div className="space-y-3">
                {subscription.contract_items.map((item, idx) => (
                  <CPageCard key={item.id || idx}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <CustomerProductLink
                          productId={item.product || item.product_id}
                          productName={cleanProductTitle(item.product_name)}
                          productCode={item.product_code}
                          thumbnailSize="sm"
                          inspectButtonLabel="Inspect Gallery"
                        />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span>Quantity: <strong className="text-foreground">{item.quantity}</strong></span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">Monthly Share</div>
                        <div className="text-sm font-bold text-primary">
                          {formatRupee(item.monthly_amount)}/mo
                        </div>
                        {(item.product || item.product_id) ? (
                          <Link
                            href={`/customer/catalog/${item.product || item.product_id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline mt-1"
                          >
                            <ExternalLink className="size-3" />
                            <span>Catalog</span>
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    {/* Product attribute badges */}
                    <div className="mt-2.5">
                      <ProductAttributeBadges nameFallback={item.product_name} size="xs" />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Base Value: </span>
                        <span className="font-semibold text-foreground">
                          {formatRupee(item.total_base_price || item.unit_base_price)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-muted-foreground">Deposit Share: </span>
                        <span className="font-semibold text-foreground">
                          {formatRupee(item.security_deposit_amount || 0)}
                        </span>
                      </div>
                    </div>
                  </CPageCard>
                ))}
              </div>
            </CPageSection>
          ) : null}

          {/* Security Deposit Section */}
          {hasSecurityDeposit ? (
            <CPageSection title="Security Deposit">
              <CPageCard>
                <InfoRow
                  label="Deposit Amount"
                  value={
                    <span className="text-base font-bold text-primary">
                      {formatRupee(effectiveSecurityDepositAmount)}
                    </span>
                  }
                />
                {Number(subscription.security_deposit_percent || 0) > 0 ? (
                  <InfoRow label="Deposit rate" value={`${subscription.security_deposit_percent}%`} />
                ) : null}
                <InfoRow
                  label="Refundable deposit"
                  value={
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatRupee(effectiveRefundableDeposit)}
                    </span>
                  }
                />
                <InfoRow
                  label="Deposit status"
                  value={
                    <ERPStatusBadge
                      status={subscription.deposit_status || "PENDING"}
                      label={
                        subscription.deposit_status === "SUBMITTED" || subscription.deposit_status === "PAID"
                          ? "Held / Received"
                          : subscription.deposit_status === "REFUNDED"
                          ? "Refunded"
                          : "Pending Deposit"
                      }
                    />
                  }
                />
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Security deposit is held in a protected escrow balance and is refundable upon return condition assessment under contract terms.
                </p>
              </CPageCard>
            </CPageSection>
          ) : null}

          {/* Financial position */}
          <CPageSection title="Financial Position">
            <CPageCard>
              <InfoRow label={isRentOrLease ? "Total Contract Value" : "EMI total"} value={formatRupee(financialSummary.emi_total)} />
              <InfoRow label="Paid" value={<span className="text-emerald-600 dark:text-emerald-400">{formatRupee(financialSummary.paid_amount)}</span>} />
              <InfoRow label="Waived" value={formatRupee(financialSummary.waived_amount)} />
              <InfoRow label="Outstanding" value={<span className={detailSemantics.isSettled ? "text-emerald-600" : "text-amber-600"}>{formatRupee(financialSummary.outstanding_amount)}</span>} />
              <InfoRow label={isRentOrLease ? "Installment Completion" : "EMI Completion"} value={`${paidEmiCount} of ${emiRows.length || subscription.tenure_months || 0} Installments (${pendingEmiCount} Pending)`} />
              {hasSecurityDeposit ? (
                <InfoRow label="Security Deposit held" value={<span className="text-primary font-bold">{formatRupee(effectiveSecurityDepositAmount)}</span>} />
              ) : null}
            </CPageCard>
          </CPageSection>

          {/* Winner info */}
          {detailSemantics.hasWinnerHistory || subscription.winner_status ? (
            <CPageSection title="Winner Status">
              <CPageCard>
                <div className="mb-3">
                  <ERPStatusBadge status={detailSemantics.winnerStatus === "WON" ? "WON" : "NOT_WON"} label={detailSemantics.winnerStatus === "WON" ? "Winner!" : "Not won yet"} />
                </div>
                {detailSemantics.winnerMonth ? (
                  <InfoRow label="Winner month" value={formatWinnerMonthLabel(detailSemantics.winnerMonth)} />
                ) : null}
                {detailSemantics.drawRevealedAt ? (
                  <InfoRow label="Draw revealed" value={formatDateTime(detailSemantics.drawRevealedAt)} />
                ) : null}
                {detailSemantics.hasWaiver ? (
                  <>
                    <InfoRow label="Waived EMIs" value={String(detailSemantics.waivedEmiCount)} />
                    <InfoRow label="Waived amount" value={formatRupee(detailSemantics.waivedAmount)} />
                  </>
                ) : null}
              </CPageCard>
            </CPageSection>
          ) : null}

          {/* EMI schedule */}
          <CPageSection title={isRentOrLease ? "Rental Billing Schedule" : "Advance EMI Schedule"}>
            {emiRows.length === 0 ? (
              <ERPEmptyState title={isRentOrLease ? "No rental schedule" : "No EMI schedule"} description={isRentOrLease ? "No rental billing schedule generated for this subscription." : "No advance EMI rows for this subscription."} />
            ) : (
              <div className="space-y-2">
                {emiRows.map((row) => {
                  const badge = resolveEmiBadge(row);
                  return (
                    <CPageCard key={row.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-foreground">
                            {isRentOrLease ? `Month ${row.month_no} Rent` : `Month ${row.month_no}`}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{formatDate(row.due_date)}</div>
                        </div>
                        <ERPStatusBadge status={badge.status} label={badge.label} />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-xs">
                        <div>
                          <div className="text-muted-foreground">Due</div>
                          <div className="font-semibold mt-0.5">{formatRupee(row.amount)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Paid</div>
                          <div className="font-semibold text-emerald-600 mt-0.5">{formatRupee(row.paid_amount)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Balance</div>
                          <div className={`font-semibold mt-0.5 ${row.outstanding_amount > 0 ? "text-amber-600" : "text-foreground"}`}>{formatRupee(row.outstanding_amount)}</div>
                        </div>
                      </div>
                    </CPageCard>
                  );
                })}
              </div>
            )}
          </CPageSection>

          {/* Delivery summary */}
          {subscription.delivery_summary ? (
            <CPageSection title="Delivery">
              <CPageCard>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="text-sm font-bold text-foreground">{subscription.delivery_summary.delivery_reference}</div>
                  <ERPStatusBadge status={subscription.delivery_summary.status} />
                </div>
                <InfoRow label="Scheduled" value={formatDate(subscription.delivery_summary.scheduled_date)} />
                {subscription.delivery_summary.delivered_at ? (
                  <InfoRow label="Delivered" value={formatDateTime(subscription.delivery_summary.delivered_at)} />
                ) : null}
                {subscription.delivery_summary.receiver_name ? (
                  <InfoRow label="Receiver" value={text(subscription.delivery_summary.receiver_name)} />
                ) : null}
              </CPageCard>
            </CPageSection>
          ) : null}

          {/* Contract Amendments */}
          <CPageSection title="Contract Amendments & Variations">
            <CPageCard>
              {subscription.amendments && subscription.amendments.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Amendments on File ({subscription.amendments.length})
                  </div>
                  <div className="divide-y divide-border/60">
                    {subscription.amendments.map((amd) => (
                      <div key={amd.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-foreground">
                            {amd.amendment_no}
                          </span>
                          <ERPStatusBadge status={amd.status} />
                        </div>
                        <div className="text-xs font-semibold text-foreground">
                          {amd.amendment_type.replace(/_/g, " ")}
                        </div>
                        {amd.reason ? (
                          <p className="text-[11px] text-muted-foreground">
                            Reason: {amd.reason}
                          </p>
                        ) : null}
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                          {amd.effective_date ? (
                            <span>Effective: {formatDate(amd.effective_date)}</span>
                          ) : (
                            <span>Requested: {formatDate(amd.created_at)}</span>
                          )}
                          {Number(amd.financial_impact_amount || 0) !== 0 ? (
                            <span className="font-semibold text-foreground">
                              Impact: {formatRupee(amd.financial_impact_amount)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground py-1">
                  No active or historical amendments filed on this contract.
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap gap-2">
                {subscription.plan_type === "RENT" || subscription.plan_type === "LEASE" ? (
                  <Link
                    href={`/customer/contract-amendments/new?source_id=${subscription.id}&contract_type=RENT_LEASE&amendment_type=TENURE_EXTENSION`}
                    className="flex-1 min-w-[120px] rounded-xl bg-primary text-primary-foreground py-2 text-center text-xs font-bold hover:opacity-95 transition"
                  >
                    Request Tenure Extension
                  </Link>
                ) : null}
                <Link
                  href="/customer/contract-amendments"
                  className="flex-1 min-w-[120px] rounded-xl border border-border bg-background py-2 text-center text-xs font-semibold hover:bg-muted"
                >
                  View All Amendments
                </Link>
              </div>
            </CPageCard>
          </CPageSection>
        </>
      ) : null}
    </CustomerPageShell>
  );
}
