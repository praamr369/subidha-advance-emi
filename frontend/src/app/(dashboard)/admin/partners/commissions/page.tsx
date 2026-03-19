"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import PortalPage from "@/components/ui/PortalPage";
import DataTable from "@/components/ui/DataTable";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { apiFetch, toArray } from "@/lib/api";

type Partner = {
  id: number;
  username: string;
  email?: string;
  phone?: string;
  is_active: boolean;
};

type Subscription = {
  id: number;
  customer: number;
  customer_name?: string;
  customer_phone?: string;
  product_name?: string;
  partner: number | null;
  batch: number | null;
  batch_code?: string;
  lucky_id: number | null;
  lucky_number?: number | null;
  plan_type: string;
  monthly_amount: string;
  total_amount: string;
  status: string;
};

type Payment = {
  id: number;
  customer: number;
  subscription: number;
  emi?: number | null;
  amount: string;
  method: string;
  payment_date: string;
  collected_by?: number | null;
  verified_by?: number | null;
};

type CommissionRow = {
  id: number;
  partner_label: string;
  subscription_label: string;
  customer_label: string;
  payment_count_label: string;
  collected_amount_label: string;
  estimated_commission_label: string;
  status_label: string;
};

const DEFAULT_COMMISSION_PERCENTAGE = 5;

function parseError(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed";
  const raw = error.message?.trim() || "Request failed";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const first = Object.values(parsed)[0];
    if (Array.isArray(first) && first[0]) return String(first[0]);
    if (typeof first === "string") return first;
  } catch {
    return raw;
  }

  return raw;
}

function formatCurrency(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export default function AdminPartnerCommissionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPartner = searchParams.get("partner") || "";

  const [partners, setPartners] = useState<Partner[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [partnerFilter, setPartnerFilter] = useState(initialPartner);
  const [query, setQuery] = useState("");
  const [commissionPercent, setCommissionPercent] = useState(String(DEFAULT_COMMISSION_PERCENTAGE));

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll(showRefreshing = false): Promise<void> {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);

      const [partnerRes, subscriptionRes, paymentRes] = await Promise.all([
        apiFetch("/admin/partners/"),
        apiFetch("/admin/subscriptions/"),
        apiFetch("/admin/payments/"),
      ]);

      setPartners(toArray<Partner>(partnerRes));
      setSubscriptions(toArray<Subscription>(subscriptionRes));
      setPayments(toArray<Payment>(paymentRes));
      setError(null);
    } catch (e) {
      setError(parseError(e));
      setPartners([]);
      setSubscriptions([]);
      setPayments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const partnerMap = useMemo(
    () => Object.fromEntries(partners.map((p) => [p.id, p])),
    [partners]
  );

  const paymentBySubscription = useMemo(() => {
    const map = new Map<number, Payment[]>();

    for (const payment of payments) {
      if (!map.has(payment.subscription)) {
        map.set(payment.subscription, []);
      }
      map.get(payment.subscription)!.push(payment);
    }

    return map;
  }, [payments]);

  const commissionRate = useMemo(() => {
    const numeric = Number(commissionPercent || 0);
    if (Number.isNaN(numeric) || numeric < 0) return 0;
    return numeric;
  }, [commissionPercent]);

  const scopedSubscriptions = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return subscriptions.filter((sub) => {
      if (!sub.partner) return false;
      if (partnerFilter && String(sub.partner) !== partnerFilter) return false;

      if (!needle) return true;

      const partner = partnerMap[sub.partner];
      const haystack = [
        String(sub.id),
        sub.customer_name,
        sub.customer_phone,
        sub.product_name,
        sub.batch_code,
        sub.lucky_number != null ? String(sub.lucky_number) : "",
        partner?.username,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [subscriptions, partnerFilter, query, partnerMap]);

  const rows = useMemo<CommissionRow[]>(() => {
    return scopedSubscriptions.map((sub) => {
      const partner = sub.partner ? partnerMap[sub.partner] : null;
      const subscriptionPayments = paymentBySubscription.get(sub.id) || [];
      const collectedAmount = subscriptionPayments.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );
      const estimatedCommission = (collectedAmount * commissionRate) / 100;

      return {
        id: sub.id,
        partner_label: partner ? `${partner.username}${partner.phone ? ` (${partner.phone})` : ""}` : "-",
        subscription_label: `#${sub.id} • ${sub.product_name || "Product"} • ${sub.batch_code || "-"}${sub.lucky_number != null ? ` • Lucky #${sub.lucky_number}` : ""}`,
        customer_label: `${sub.customer_name || `Customer ${sub.customer}`}${sub.customer_phone ? ` (${sub.customer_phone})` : ""}`,
        payment_count_label: String(subscriptionPayments.length),
        collected_amount_label: formatCurrency(collectedAmount),
        estimated_commission_label: formatCurrency(estimatedCommission),
        status_label: sub.status,
      };
    });
  }, [scopedSubscriptions, partnerMap, paymentBySubscription, commissionRate]);

  const kpis = useMemo(() => {
    const partnerIds = new Set<number>();
    let linkedSubscriptions = 0;
    let collectedAmount = 0;
    let estimatedCommission = 0;

    for (const sub of scopedSubscriptions) {
      if (sub.partner) partnerIds.add(sub.partner);
      linkedSubscriptions += 1;

      const subscriptionPayments = paymentBySubscription.get(sub.id) || [];
      const totalCollectedForSubscription = subscriptionPayments.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );

      collectedAmount += totalCollectedForSubscription;
      estimatedCommission += (totalCollectedForSubscription * commissionRate) / 100;
    }

    return {
      partnersInScope: partnerIds.size,
      linkedSubscriptions,
      collectedAmount,
      estimatedCommission,
      activeSubscriptions: scopedSubscriptions.filter((s) => s.status === "ACTIVE").length,
      wonSubscriptions: scopedSubscriptions.filter((s) => s.status === "WON").length,
    };
  }, [scopedSubscriptions, paymentBySubscription, commissionRate]);

  return (
    <PortalPage
      title="Partner Commissions"
      subtitle="Track partner-linked collections and estimate payout exposure from subscription payment activity."
    >
      <section className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/admin/partners"
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          Back to Partners
        </Link>
        <button
          type="button"
          onClick={() => loadAll(true)}
          disabled={refreshing}
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
        <Link
          href="/admin/payments"
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          Open Payments
        </Link>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Partners in Scope
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {kpis.partnersInScope}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Linked Subscriptions
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {kpis.linkedSubscriptions}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Active Subscriptions
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {kpis.activeSubscriptions}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Won Subscriptions
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {kpis.wonSubscriptions}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Collected Amount
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {formatCurrency(kpis.collectedAmount)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Estimated Commission
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {formatCurrency(kpis.estimatedCommission)}
          </div>
        </div>
      </section>

      <section className="mb-4 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Filters</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label
              htmlFor="commission-partner"
              className="text-xs font-medium text-muted-foreground"
            >
              Partner
            </label>
            <select
              id="commission-partner"
              value={partnerFilter}
              onChange={(event) => setPartnerFilter(event.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">All partners</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.username} {partner.phone ? `(${partner.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="commission-search"
              className="text-xs font-medium text-muted-foreground"
            >
              Search
            </label>
            <input
              id="commission-search"
              placeholder="Customer, product, batch, lucky no..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="commission-percent"
              className="text-xs font-medium text-muted-foreground"
            >
              Commission %
            </label>
            <input
              id="commission-percent"
              type="number"
              min={0}
              step="0.01"
              value={commissionPercent}
              onChange={(event) => setCommissionPercent(event.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setPartnerFilter("");
              setQuery("");
              setCommissionPercent(String(DEFAULT_COMMISSION_PERCENTAGE));
            }}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            Reset Filters
          </button>
        </div>
      </section>

      {loading ? <LoadingBlock label="Loading partner commission exposure..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load partner commission data"
          description={error}
          onRetry={() => loadAll(false)}
        />
      ) : null}

      {!loading && !error ? (
        <>
          <DataTable<CommissionRow>
            rows={rows}
            error={null}
            columns={[
              { key: "partner_label", title: "Partner" },
              { key: "subscription_label", title: "Subscription" },
              { key: "customer_label", title: "Customer" },
              { key: "payment_count_label", title: "Payments" },
              { key: "collected_amount_label", title: "Collected" },
              { key: "estimated_commission_label", title: "Estimated Commission" },
              { key: "status_label", title: "Subscription Status" },
            ]}
          />

          {scopedSubscriptions.length > 0 ? (
            <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground">
                Priority Review Queue
              </h2>

              <div className="grid gap-3">
                {scopedSubscriptions.slice(0, 8).map((sub) => {
              const partner = sub.partner ? partnerMap[sub.partner] : null;
              const subscriptionPayments = paymentBySubscription.get(sub.id) || [];
              const collectedAmount = subscriptionPayments.reduce(
                (sum, payment) => sum + Number(payment.amount || 0),
                0
              );
              const estimatedCommission = (collectedAmount * commissionRate) / 100;

                  return (
                    <div
                      key={sub.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3 text-sm"
                    >
                      <div>
                        <div className="font-medium text-foreground">
                          {partner?.username || "-"} — Subscription #{sub.id}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Customer: {sub.customer_name || `Customer ${sub.customer}`} • Collected:{" "}
                          {formatCurrency(collectedAmount)} • Estimated commission:{" "}
                          {formatCurrency(estimatedCommission)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/subscriptions/${sub.id}`)}
                          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:bg-muted"
                        >
                          View Subscription
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/payments?subscription=${sub.id}`)}
                          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:bg-muted"
                        >
                          View Payments
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="mt-4 rounded-2xl border border-border bg-muted/40 p-4">
            <h2 className="text-sm font-semibold text-foreground">Operational Note</h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              This page estimates commission exposure from partner-linked subscriptions and recorded
              payments. For final payout accounting, expose a dedicated backend commission API from
              your Commission model.
            </p>
          </section>
        </>
      ) : null}
    </PortalPage>
  );
}