"use client";

import { formatRupee } from "@/lib/utils/currency";
import Link from "next/link";
import { RefreshCw, Package, Star, Camera } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import CustomerProductLink from "@/components/customers/CustomerProductInspectModal";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import PaginationControls from "@/components/ui/PaginationControls";
import CustomerPageShell, {
  CPageCard,
  CPageSection,
  CPageStats,
  CPageStat,
  CPageTabs,
} from "@/components/layout/CustomerPageShell";
import {
  listCustomerSubscriptionsRegister,
} from "@/services/customer/paginated-subscriptions";
import type { CustomerSubscription } from "@/services/customer";

const PAGE_SIZE = 25;

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function planBadge(planType: string) {
  const pt = (planType || "").toUpperCase();
  if (pt === "EMI") return "bg-purple-100 text-purple-800";
  if (pt === "RENT") return "bg-sky-100 text-sky-800";
  if (pt === "LEASE") return "bg-indigo-100 text-indigo-800";
  return "bg-muted text-muted-foreground";
}

function planLabel(planType: string) {
  const pt = (planType || "").toUpperCase();
  if (pt === "EMI") return "Advance EMI";
  if (pt === "RENT") return "Rent";
  if (pt === "LEASE") return "Lease";
  return pt;
}

function SubscriptionCard({ sub }: { sub: CustomerSubscription }) {
  const isWinner =
    (sub.status || "").toUpperCase() === "WON" ||
    (sub.winner_month !== null && sub.winner_month !== undefined);
  const outstanding = Number(
    sub.outstanding_amount ?? sub.financial_summary?.outstanding_amount ?? 0
  );
  const isRentOrLease = sub.plan_type === "RENT" || sub.plan_type === "LEASE";
  const itemsDepositTotal = Array.isArray(sub.contract_items)
    ? sub.contract_items.reduce((sum, item) => sum + Number(item.security_deposit_amount || 0), 0)
    : 0;
  const snapDeposit = Number(
    (sub.pricing_snapshot as Record<string, unknown> | undefined)?.security_deposit_amount || 0
  );
  const directDeposit = Number(sub.security_deposit_amount || 0);

  const effectiveDeposit = useMemo(() => {
    if (directDeposit > 0) return directDeposit;
    if (itemsDepositTotal > 0) return itemsDepositTotal;
    if (snapDeposit > 0) return snapDeposit;
    const ref = Number(sub.refundable_security_deposit || 0);
    if (ref > 0) return ref;
    if (Array.isArray(sub.rent_lease_demands)) {
      const depDemand = sub.rent_lease_demands.find((d) => d.demand_type === "SECURITY_DEPOSIT");
      if (depDemand && Number(depDemand.amount || 0) > 0) {
        return Number(depDemand.amount);
      }
    }
    if (isRentOrLease) {
      const itemsBaseTotal = Array.isArray(sub.contract_items)
        ? sub.contract_items.reduce((sum, item) => sum + Number(item.total_base_price || 0), 0)
        : 0;
      const base = itemsBaseTotal > 0 ? itemsBaseTotal : Number(sub.product_base_price || 0);
      const pct = Number(sub.security_deposit_percent || 20);
      if (base > 0) return (base * pct) / 100;
      if (Number(sub.monthly_amount || 0) > 0) {
        return Number(sub.monthly_amount) * 4;
      }
    }
    return 0;
  }, [directDeposit, itemsDepositTotal, snapDeposit, sub, isRentOrLease]);

  return (
    <CPageCard href={`/customer/subscriptions/${sub.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${planBadge(sub.plan_type ?? "")}`}>
              {planLabel(sub.plan_type ?? "")}
            </span>
            {isWinner ? (
              <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold flex items-center gap-1">
                <Star className="size-2.5" /> Winner
              </span>
            ) : null}
          </div>
          <div className="mt-1">
            <CustomerProductLink
              productId={sub.product}
              productName={
                sub.contract_items && sub.contract_items.length > 1
                  ? `${(sub.product_name || "").replace(/\s*\([^)]+:[^)]+\)\s*$/i, "").trim()} + ${sub.contract_items.length - 1} more (${sub.contract_items.length} items)`
                  : sub.product_name || `Product #${sub.product}`
              }
              productImage={sub.product_image}
              thumbnailSize="md"
              inspectButtonLabel="Inspect Gallery"
            />
          </div>
          {sub.subscription_number ? (
            <div className="text-xs font-mono text-muted-foreground mt-0.5">
              {sub.subscription_number}
            </div>
          ) : null}

          {sub.contract_items && sub.contract_items.length > 1 ? (
            <div className="mt-2.5 rounded-xl border border-border/70 bg-muted/30 p-2 text-xs">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                <span>Products ({sub.contract_items.length})</span>
                <span className="text-primary font-semibold">Multi-Product Package</span>
              </div>
              <div className="divide-y divide-border/50">
                {sub.contract_items.map((item, idx) => (
                  <div key={item.id || idx} className="py-1 flex items-center justify-between gap-1 text-[11px]">
                    <span className="font-medium text-foreground truncate">
                      {idx + 1}. {(item.product_name || "").replace(/\s*\([^)]+:[^)]+\)\s*$/i, "").trim()} × {item.quantity}
                    </span>
                    <span className="font-semibold text-primary shrink-0">{formatRupee(item.monthly_amount)}/mo</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <ERPStatusBadge status={sub.status || "ACTIVE"} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
        <div>
          <span className="text-muted-foreground">Monthly Installment</span>
          <div className="font-semibold mt-0.5">{formatRupee(sub.monthly_amount)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Total Paid</span>
          <div className="font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
            {formatRupee(sub.total_paid_amount ?? sub.financial_summary?.paid_amount)}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Contract Tenure</span>
          <div className="font-semibold mt-0.5">{sub.tenure_months ? `${sub.tenure_months} Months` : "—"}</div>
        </div>
        <div>
          <span className="text-muted-foreground">{isRentOrLease ? "Installment Progress" : "EMI Progress"}</span>
          <div className="font-semibold mt-0.5">
            {sub.paid_emi_count ?? 0} of {(isRentOrLease ? (sub.tenure_months ?? sub.emi_count ?? 12) : (sub.emi_count ?? sub.tenure_months)) ?? "—"} Paid
          </div>
        </div>
        {Number(effectiveDeposit || 0) > 0 || isRentOrLease ? (
          <div>
            <span className="text-muted-foreground">Security Deposit</span>
            <div className="font-semibold text-primary mt-0.5">
              {formatRupee(effectiveDeposit)}
            </div>
            <div className="text-[10px] mt-0.5 font-medium flex items-center gap-1 flex-wrap">
              <span className="text-muted-foreground">Paid:</span>
              <span className={Number(sub.security_deposit_paid || 0) >= Number(effectiveDeposit) && Number(effectiveDeposit) > 0 ? "font-bold text-emerald-600 dark:text-emerald-400" : "font-semibold text-foreground"}>
                {formatRupee(sub.security_deposit_paid || 0)}
              </span>
              {Number(sub.security_deposit_paid || 0) >= Number(effectiveDeposit) && Number(effectiveDeposit) > 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400">✓</span>
              ) : Number(sub.security_deposit_pending ?? Math.max(Number(effectiveDeposit) - Number(sub.security_deposit_paid || 0), 0)) > 0 ? (
                <span className="text-amber-600 dark:text-amber-400">
                  ({formatRupee(sub.security_deposit_pending ?? Math.max(Number(effectiveDeposit) - Number(sub.security_deposit_paid || 0), 0))} due)
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        {sub.batch_code ? (
          <div>
            <span className="text-muted-foreground">Batch</span>
            <div className="font-semibold mt-0.5">{sub.batch_code}</div>
          </div>
        ) : null}
        {sub.lucky_number != null ? (
          <div>
            <span className="text-muted-foreground">Lucky #</span>
            <div className="font-semibold mt-0.5">#{String(sub.lucky_number).padStart(2, "0")}</div>
          </div>
        ) : null}
        {sub.next_due_date ? (
          <div className="col-span-2">
            <span className="text-muted-foreground">Next Due</span>
            <div className="font-semibold mt-0.5">{formatDate(sub.next_due_date)}</div>
          </div>
        ) : null}
      </div>

      {Number(sub.amendments_count ?? 0) > 0 ? (
        <div className="mt-2 rounded-xl bg-sky-50 dark:bg-sky-950/30 px-3 py-1 text-[11px] font-medium text-sky-800 dark:text-sky-300 flex items-center justify-between">
          <span>📝 {sub.amendments_count ?? 0} Amendment{(sub.amendments_count ?? 0) > 1 ? "s" : ""} on file</span>
          <span className="font-semibold underline">Details →</span>
        </div>
      ) : null}

      {outstanding > 0 ? (
        <div className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Outstanding: {formatRupee(outstanding)}
        </div>
      ) : null}

      {isWinner && sub.winner_month != null ? (
        <div className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
          <Star className="size-3" /> Winner month {sub.winner_month}
          {Number(sub.waived_amount ?? 0) > 0 ? ` · Waived ${formatRupee(sub.waived_amount)}` : ""}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-border/60">
        <Link
          href={`/customer/subscriptions/${sub.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-[90px] rounded-xl border border-border bg-background py-2 text-center text-xs font-semibold hover:bg-muted transition"
        >
          View Detail
        </Link>
        {sub.product ? (
          <Link
            href={`/customer/catalog/${sub.product}`}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-[90px] rounded-xl border border-primary/30 bg-primary/5 text-primary py-2 text-center text-xs font-bold hover:bg-primary/10 transition flex items-center justify-center gap-1 active:scale-95"
          >
            <Camera className="size-3" />
            <span>Product Gallery</span>
          </Link>
        ) : null}
      </div>
    </CPageCard>
  );
}

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "WON", label: "Won" },
  { value: "COMPLETED", label: "Done" },
] as const;

export default function CustomerSubscriptionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = (searchParams.get("status") || "").trim().toUpperCase();
  const currentPage = Math.max(Number(searchParams.get("page") || 1), 1);

  const query = useQuery({
    queryKey: ["customerSubscriptionsRegister", statusFilter, currentPage],
    queryFn: () => listCustomerSubscriptionsRegister({
      status: statusFilter || undefined,
      page: currentPage,
      pageSize: PAGE_SIZE,
    })
  });

  const rows = query.data?.results || [];
  const count = query.data?.count || 0;
  const page = query.data?.page || currentPage;
  const numPages = query.data?.num_pages || 0;
  const hasNext = query.data?.has_next || false;
  const hasPrevious = query.data?.has_previous || false;
  const loading = query.isLoading;
  const error = query.error ? (query.error as Error).message : null;

  const loadPage = useCallback(async () => { await query.refetch(); }, [query]);

  const activeCount = useMemo(() => rows.filter((r) => (r.status || "").toUpperCase() === "ACTIVE").length, [rows]);
  const winnerCount = useMemo(
    () => rows.filter((r) => (r.status || "").toUpperCase() === "WON" || r.winner_month != null).length,
    [rows]
  );
  const outstanding = useMemo(
    () => rows.reduce((s, r) => s + Number(r.outstanding_amount ?? r.financial_summary?.outstanding_amount ?? 0), 0),
    [rows]
  );

  function replacePage(targetPage: number) {
    const next = new URLSearchParams();
    if (statusFilter) next.set("status", statusFilter);
    if (targetPage > 1) next.set("page", String(targetPage));
    const query = next.toString();
    router.replace(query ? `/customer/subscriptions?${query}` : "/customer/subscriptions");
  }

  function applyStatus(value: string) {
    const next = new URLSearchParams();
    if (value) next.set("status", value);
    const query = next.toString();
    router.replace(query ? `/customer/subscriptions?${query}` : "/customer/subscriptions");
  }

  return (
    <CustomerPageShell
      title="My Subscriptions"
      subtitle="All your contracts and plans"
      backHref="/customer"
      backLabel="Dashboard"
      actions={
        <Link
          href="/customer/subscription-requests"
          className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"
        >
          + New
        </Link>
      }
    >
      {/* Stats */}
      {!loading && count > 0 ? (
        <CPageStats>
          <CPageStat label="Total" value={count} />
          <CPageStat label="Active" value={activeCount} tone="success" />
          <CPageStat label="Winners" value={winnerCount} tone="warning" />
          <CPageStat label="Outstanding" value={formatRupee(outstanding)} tone={outstanding > 0 ? "danger" : "default"} />
        </CPageStats>
      ) : null}

      {/* Filter tabs */}
      <CPageSection>
        <CPageTabs
          tabs={STATUS_TABS.map((t) => ({ value: t.value, label: t.label }))}
          active={statusFilter}
          onChange={applyStatus}
        />
      </CPageSection>

      {loading ? <ERPLoadingState label="Loading subscriptions..." /> : null}

      {!loading && error ? (
        <ERPErrorState
          title="Unable to load subscriptions"
          description={error}
          onRetry={() => void loadPage()}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState
          title="No subscriptions found"
          description={statusFilter ? `No contracts with status "${statusFilter}".` : "You don't have any contracts yet."}
          icon={<Package className="h-10 w-10 text-muted-foreground/40" />}
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <CPageSection>
          <div className="space-y-3">
            {rows.map((sub) => (
              <SubscriptionCard key={sub.id} sub={sub} />
            ))}
          </div>
          {count > PAGE_SIZE ? (
            <div className="mt-4">
              <PaginationControls
                count={count}
                page={page}
                pageSize={PAGE_SIZE}
                numPages={numPages}
                hasNext={hasNext}
                hasPrevious={hasPrevious}
                disabled={loading}
                onPrevious={() => replacePage(Math.max(page - 1, 1))}
                onNext={() => replacePage(page + 1)}
              />
            </div>
          ) : null}
        </CPageSection>
      ) : null}

      <div className="mt-4 flex gap-2 flex-wrap">
        <Link href="/customer/contracts" className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted">
          My Contracts →
        </Link>
        <Link href="/customer/emis" className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted">
          EMI Schedule →
        </Link>
        <button
          type="button"
          onClick={() => void loadPage()}
          disabled={loading}
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 flex items-center gap-1"
        >
          <RefreshCw className="size-3" /> Refresh
        </button>
      </div>
    </CustomerPageShell>
  );
}
