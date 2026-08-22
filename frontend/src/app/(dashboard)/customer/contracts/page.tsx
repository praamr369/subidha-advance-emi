"use client";

import { formatRupee } from "@/lib/utils/currency";
import Link from "next/link";
import { Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  const pt = (sub.plan_type ?? "").toUpperCase();
  const isWinner =
    (sub.status || "").toUpperCase() === "WON" ||
    (sub.winner_month !== null && sub.winner_month !== undefined);

  return (
    <CPageCard href={`/customer/subscriptions/${sub.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${planBadgeClass(sub.plan_type ?? "")}`}>
              {planLabel(sub.plan_type ?? "")}
            </span>
            {isWinner ? (
              <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold flex items-center gap-1">
                <Star className="size-2.5" /> Winner
              </span>
            ) : null}
          </div>
          <div className="text-sm font-bold text-foreground">
            {sub.product_name || `Product #${sub.product}`}
          </div>
          {sub.subscription_number ? (
            <div className="font-mono text-xs text-muted-foreground mt-0.5">{sub.subscription_number}</div>
          ) : null}
        </div>
        <ERPStatusBadge status={sub.status ?? "—"} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
        <div>
          <span className="text-muted-foreground">Monthly</span>
          <div className="font-semibold mt-0.5">{formatRupee(sub.monthly_amount)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Total</span>
          <div className="font-semibold mt-0.5">{formatRupee(sub.total_amount)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Tenure</span>
          <div className="font-semibold mt-0.5">{sub.tenure_months ? `${sub.tenure_months} months` : "—"}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Start</span>
          <div className="font-semibold mt-0.5">{formatDate(sub.start_date)}</div>
        </div>
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

      <div className="mt-3 flex gap-2">
        <Link
          href={`/customer/subscriptions/${sub.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 rounded-xl border border-border bg-background py-2 text-center text-xs font-semibold hover:bg-muted"
        >
          View Detail
        </Link>
        {pt === "RENT" ? (
          <a
            href={customerRentContractPdfUrl(sub.id)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-1 rounded-xl border border-border bg-background py-2 text-center text-xs font-semibold hover:bg-muted"
          >
            Contract PDF
          </a>
        ) : null}
        {pt === "LEASE" ? (
          <a
            href={customerLeaseContractPdfUrl(sub.id)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-1 rounded-xl border border-border bg-background py-2 text-center text-xs font-semibold hover:bg-muted"
          >
            Contract PDF
          </a>
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
