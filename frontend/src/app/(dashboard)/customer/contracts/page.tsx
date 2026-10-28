"use client";

import { formatRupee } from "@/lib/utils/currency";
import Link from "next/link";
import { Star, Camera, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import CustomerProductLink from "@/components/customers/CustomerProductInspectModal";
import { openAuthenticatedFile } from "@/lib/export/auth-download";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import CustomerPageShell, {
  CPageCard,
  CPageSection,
  CPageStats,
  CPageStat,
  CPageTabs,
} from "@/components/layout/CustomerPageShell";
import { listCustomerSubscriptionsRegister } from "@/services/customer/paginated-subscriptions";
import type { CustomerSubscription } from "@/services/customer";
import { customerRentContractPdfUrl, customerLeaseContractPdfUrl } from "@/services/customer-portal";

const PAGE_SIZE = 50;

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

function planBadgeClass(planType: string) {
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

function ContractCard({ sub }: { sub: CustomerSubscription }) {
  const [openingPdf, setOpeningPdf] = useState(false);
  const pt = (sub.plan_type ?? "").toUpperCase();
  const isWinner =
    (sub.status || "").toUpperCase() === "WON" ||
    (sub.winner_month !== null && sub.winner_month !== undefined);
  const hasSecurityDeposit =
    pt === "RENT" ||
    pt === "LEASE" ||
    Number(sub.security_deposit_amount || 0) > 0;
  const emiTotalCount = sub.emi_count ?? sub.tenure_months ?? null;
  const paidCount = sub.paid_emi_count ?? 0;
  const pendingCount = sub.pending_emi_count ?? (emiTotalCount ? Math.max(emiTotalCount - paidCount, 0) : null);
  const securityDepositTotal = Number(sub.security_deposit_amount ?? 0);
  const securityDepositPaid = Number(sub.security_deposit_paid ?? 0);
  const securityDepositRemaining = Math.max(
    Number(sub.security_deposit_pending ?? securityDepositTotal - securityDepositPaid),
    0,
  );

  return (
    <CPageCard href={`/customer/subscriptions/${sub.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${planBadgeClass(sub.plan_type ?? "")}`}>
              {planLabel(sub.plan_type ?? "")}
            </span>
            {sub.has_customer_signature ? (
              <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                ✓ Signed
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                ⏳ Sign Pending
              </span>
            )}
            {hasSecurityDeposit && sub.deposit_status && sub.deposit_status !== "NOT_REQUIRED" ? (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                sub.deposit_status === "SUBMITTED" || sub.deposit_status === "PAID"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}>
                Deposit: {sub.deposit_status}
              </span>
            ) : null}
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
            <div className="font-mono text-xs text-muted-foreground mt-0.5">{sub.subscription_number}</div>
          ) : null}
        </div>
        <ERPStatusBadge status={sub.status ?? "—"} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
        <div>
          <span className="text-muted-foreground">Monthly Installment</span>
          <div className="font-semibold mt-0.5">{formatRupee(sub.monthly_amount)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Total Contract Value</span>
          <div className="font-semibold mt-0.5">{formatRupee(sub.total_amount)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Contract Tenure</span>
          <div className="font-semibold mt-0.5">{sub.tenure_months ? `${sub.tenure_months} Months` : "—"}</div>
        </div>
        <div>
          <span className="text-muted-foreground">EMI Progress</span>
          <div className="font-semibold mt-0.5">
            {paidCount} of {emiTotalCount ?? "—"} Paid
            {pendingCount !== null && pendingCount > 0 ? (
              <span className="ml-1 text-[10px] font-normal text-amber-600">({pendingCount} due)</span>
            ) : null}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Start Date</span>
          <div className="font-semibold mt-0.5">{formatDate(sub.start_date)}</div>
        </div>
        {hasSecurityDeposit ? (
          <div>
            <span className="text-muted-foreground">Security Deposit</span>
            <div className="font-semibold text-primary mt-0.5">
              Total: {formatRupee(securityDepositTotal)}
              {Number(sub.refundable_security_deposit ?? sub.security_deposit_amount ?? 0) > 0 ? (
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">(Refundable)</span>
              ) : null}
            </div>
            <div className="mt-0.5 space-y-0.5 text-[10px] font-medium">
              <div className="text-emerald-700 dark:text-emerald-400">Paid: {formatRupee(securityDepositPaid)}</div>
              <div className={securityDepositRemaining > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}>
                Remaining: {formatRupee(securityDepositRemaining)}
              </div>
            </div>
          </div>
        ) : null}
        {pt === "EMI" && sub.batch_code ? (
          <div>
            <span className="text-muted-foreground">Batch</span>
            <div className="font-semibold mt-0.5">{sub.batch_code}</div>
          </div>
        ) : null}
        {pt === "EMI" && sub.lucky_number != null ? (
          <div>
            <span className="text-muted-foreground">Lucky #</span>
            <div className="font-semibold mt-0.5">#{String(sub.lucky_number).padStart(2, "0")}</div>
          </div>
        ) : null}
      </div>

      {Number(sub.outstanding_amount ?? 0) > 0 ? (
        <div className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-700">
          Outstanding: {formatRupee(sub.outstanding_amount)}
        </div>
      ) : null}

      {Number(sub.amendments_count ?? 0) > 0 ? (
        <div className="mt-2.5 rounded-xl border border-sky-200 bg-sky-50 dark:bg-sky-950/30 px-3 py-1.5 text-xs font-medium text-sky-800 dark:text-sky-300 flex items-center justify-between">
          <span>📝 {sub.amendments_count ?? 0} Contract Amendment{(sub.amendments_count ?? 0) > 1 ? "s" : ""} on record</span>
          <Link
            href={`/customer/contract-amendments?source_id=${sub.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-bold underline hover:text-sky-900"
          >
            View Details
          </Link>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/customer/subscriptions/${sub.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-[90px] rounded-xl border border-border bg-background py-2 text-center text-xs font-semibold hover:bg-muted"
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
        {!sub.has_customer_signature && sub.signing_path ? (
          <Link
            href={sub.signing_path}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-[90px] rounded-xl bg-sky-600 text-white py-2 text-center text-xs font-bold hover:bg-sky-700 transition active:scale-95 shadow-sm"
          >
            ✍ Sign Contract
          </Link>
        ) : null}
        {pt === "RENT" || pt === "LEASE" ? (
          <button
            type="button"
            disabled={openingPdf}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpeningPdf(true);
              try {
                const path =
                  pt === "RENT"
                    ? customerRentContractPdfUrl(sub.id)
                    : customerLeaseContractPdfUrl(sub.id);
                const filename = `${pt.toLowerCase()}-contract-${sub.id}.pdf`;
                await openAuthenticatedFile(path, filename);
              } catch (err) {
                alert(
                  err instanceof Error ? err.message : "Failed to open contract PDF."
                );
              } finally {
                setOpeningPdf(false);
              }
            }}
            className="flex-1 min-w-[90px] rounded-xl border border-border bg-background py-2 text-center text-xs font-semibold hover:bg-muted disabled:opacity-60 flex items-center justify-center gap-1.5 transition active:scale-95"
          >
            {openingPdf ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                <span>Opening...</span>
              </>
            ) : (
              <span>Contract PDF</span>
            )}
          </button>
        ) : null}
        {pt === "RENT" || pt === "LEASE" ? (
          <Link
            href={`/customer/contract-amendments/new?source_id=${sub.id}&contract_type=RENT_LEASE&amendment_type=TENURE_EXTENSION`}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-[90px] rounded-xl border border-primary/40 bg-primary/10 text-primary py-2 text-center text-xs font-bold hover:bg-primary/20 transition active:scale-95"
          >
            Extend / Amend
          </Link>
        ) : null}
      </div>
    </CPageCard>
  );
}

const PLAN_TABS = [
  { value: "all", label: "All" },
  { value: "emi", label: "Advance EMI" },
  { value: "rent", label: "Rent" },
  { value: "lease", label: "Lease" },
] as const;

type PlanTab = typeof PLAN_TABS[number]["value"];

export default function CustomerContractsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<CustomerSubscription[]>([]);
  const [planTab, setPlanTab] = useState<PlanTab>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listCustomerSubscriptionsRegister({ page: 1, pageSize: PAGE_SIZE });
      const rows = Array.isArray(result)
        ? (result as CustomerSubscription[])
        : (result as { results: CustomerSubscription[] }).results ?? [];
      setSubscriptions(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contracts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const emi: CustomerSubscription[] = [];
    const rent: CustomerSubscription[] = [];
    const lease: CustomerSubscription[] = [];
    const other: CustomerSubscription[] = [];
    for (const sub of subscriptions) {
      const pt = (sub.plan_type ?? "").toUpperCase();
      if (pt === "EMI") emi.push(sub);
      else if (pt === "RENT") rent.push(sub);
      else if (pt === "LEASE") lease.push(sub);
      else other.push(sub);
    }
    return { emi, rent, lease, other };
  }, [subscriptions]);

  const filtered = useMemo(() => {
    if (planTab === "emi") return grouped.emi;
    if (planTab === "rent") return grouped.rent;
    if (planTab === "lease") return grouped.lease;
    return subscriptions;
  }, [planTab, grouped, subscriptions]);

  const activeCount = useMemo(
    () => subscriptions.filter((s) => ["ACTIVE", "HANDED_OVER"].includes((s.status ?? "").toUpperCase())).length,
    [subscriptions]
  );

  return (
    <CustomerPageShell
      title="My Contracts"
      subtitle="All your Advance EMI, Rent, and Lease agreements"
      actions={
        <Link
          href="/customer/subscriptions"
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          All Subs
        </Link>
      }
    >
      {/* Stats */}
      {!loading && subscriptions.length > 0 ? (
        <CPageStats>
          <CPageStat label="Total" value={subscriptions.length} />
          <CPageStat label="Active" value={activeCount} tone="success" />
          <CPageStat label="EMI" value={grouped.emi.length} tone="info" />
          <CPageStat label="Rent/Lease" value={grouped.rent.length + grouped.lease.length} />
        </CPageStats>
      ) : null}

      {/* Plan type tabs */}
      <CPageSection>
        <CPageTabs
          tabs={PLAN_TABS.map((t) => ({
            value: t.value,
            label: t.label,
            count:
              t.value === "all"
                ? subscriptions.length
                : t.value === "emi"
                  ? grouped.emi.length
                  : t.value === "rent"
                    ? grouped.rent.length
                    : grouped.lease.length,
          }))}
          active={planTab}
          onChange={setPlanTab}
        />
      </CPageSection>

      {loading ? <ERPLoadingState label="Loading contracts..." /> : null}

      {!loading && error ? (
        <ERPErrorState
          title="Unable to load contracts"
          description={error}
          onRetry={() => void load()}
        />
      ) : null}

      {!loading && !error && filtered.length === 0 ? (
        <ERPEmptyState
          title="No contracts"
          description={
            planTab !== "all"
              ? `No ${planTab.toUpperCase()} contracts.`
              : "You don't have any contracts yet."
          }
        />
      ) : null}

      {!loading && !error && filtered.length > 0 ? (
        <CPageSection>
          <div className="space-y-3">
            {filtered.map((sub) => (
              <ContractCard key={sub.id} sub={sub} />
            ))}
          </div>
        </CPageSection>
      ) : null}
    </CustomerPageShell>
  );
}
